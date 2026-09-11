from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.datastructures import MutableHeaders
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.auth import router as auth_router
from app.api.v1.admin import router as admin_router
from app.api.v1.client import router as client_router
from app.api.v1.coach import router as coach_router
from app.api.v1.internal import router as internal_router
from app.core.config import get_settings
from app.core.errors import APIError
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.db.upgrades import upgrade_local_schema
from app.services.client import seed_demo_data
from app.services.photo_storage import LocalPhotoStorage


logger = logging.getLogger(__name__)
settings = get_settings()


def error_payload(
    *, request_id: str, code: str, message: str, fields: dict[str, str] | None = None
) -> dict:
    error: dict = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    return {"error": error, "request_id": request_id}


class RequestIdMiddleware:
    """Pure ASGI middleware avoids BaseHTTPMiddleware stream edge cases."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        inbound_headers = dict(scope.get("headers", []))
        request_id = inbound_headers.get(b"x-request-id", b"").decode() or f"req_{uuid4().hex[:12]}"
        scope.setdefault("state", {})["request_id"] = request_id

        async def send_with_request_id(message):
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["X-Request-ID"] = request_id
                if scope.get("path", "").startswith("/api/v1/"):
                    MutableHeaders(scope=message)["Cache-Control"] = "private, no-store"
            await send(message)

        await self.app(scope, receive, send_with_request_id)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not settings.supabase_enabled:
        Base.metadata.create_all(bind=engine)
        upgrade_local_schema(engine)
        LocalPhotoStorage()
        with SessionLocal() as db:
            seed_demo_data(db, settings.demo_client_id)
    yield


app = FastAPI(
    title="XForm Coaching OS API",
    version="0.1.0",
    description="Authenticated client, coach and privacy-limited admin workspaces.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)
app.add_middleware(RequestIdMiddleware)


@app.exception_handler(APIError)
async def api_error_handler(request: Request, exc: APIError):
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.as_payload(getattr(request.state, "request_id", "req_unknown")),
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    fields = {
        ".".join(str(part) for part in error["loc"] if part not in {"body", "query", "path"}): error["msg"]
        for error in exc.errors()
    }
    return JSONResponse(
        status_code=422,
        content=error_payload(
            request_id=getattr(request.state, "request_id", "req_unknown"),
            code="validation_error",
            message="Request validation failed",
            fields=fields or None,
        ),
    )


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload(
            request_id=getattr(request.state, "request_id", "req_unknown"),
            code="not_found" if exc.status_code == 404 else "http_error",
            message=str(exc.detail),
        ),
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    logger.exception("Unhandled API error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content=error_payload(
            request_id=getattr(request.state, "request_id", "req_unknown"),
            code="internal_error",
            message="Unexpected server error",
        ),
    )


API_V1_PREFIX = "/api/v1"
app.include_router(auth_router, prefix=API_V1_PREFIX)
app.include_router(admin_router, prefix=API_V1_PREFIX)
app.include_router(coach_router, prefix=API_V1_PREFIX)
app.include_router(client_router, prefix=API_V1_PREFIX)
app.include_router(internal_router, prefix=API_V1_PREFIX)
