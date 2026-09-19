"""Container entrypoint: API and built React app on one origin."""
import os
from pathlib import Path

from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles

from app.core.config import get_settings

settings = get_settings()
if settings.environment == "production" and not (settings.supabase_enabled and settings.r2_enabled):
    raise RuntimeError("Production requires Supabase and R2; container disk is ephemeral")

from app.main import app


@app.middleware("http")
async def block_internal_jobs(request, call_next):
    if request.url.path.startswith("/api/v1/internal/"):
        return JSONResponse({"detail": "Not found"}, status_code=404)
    return await call_next(request)


@app.get("/healthz", include_in_schema=False)
def health():
    return {"status": "ok"}


class SPAFiles(StaticFiles):
    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or path == "api" or path.startswith("api/") or Path(path).suffix:
                raise
            return FileResponse(Path(self.directory) / "index.html", headers={"Cache-Control": "no-cache"})


app.mount("/", SPAFiles(directory=os.environ.get("XFORM_STATIC_DIR", "/app/static")), name="frontend")
