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

from app.api.v1.router import router as v1_router
from app.core.config import get_settings
from app.core.errors import APIError
from app.db.base import Base
from app.db.session import SessionLocal, engine
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
            await send(message)

        await self.app(scope, receive, send_with_request_id)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not settings.supabase_enabled:
        Base.metadata.create_all(bind=engine)
        LocalPhotoStorage()
        with SessionLocal() as db:
            seed_demo_data(db, settings.demo_client_id)
    yield


app = FastAPI(
    title="XForm Coaching OS API",
    version="0.1.0",
    description="Client dashboard API contract. Authentication will replace temporary development identity.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH"],
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


app.include_router(v1_router)
