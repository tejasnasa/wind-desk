"""FastAPI application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api.routes import router
from .config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)

DESCRIPTION = """
**Wind Desk** turns Elexon's national wind data into the two things a day-ahead
power buyer needs on D-1:

1. the *latest forecast available at gate closure* for the delivery day, and
2. a *quantified* view of how wrong that forecast has historically been.

Data: `FUELHH` (half-hourly actuals, fuelType WIND) and `WINDFOR` (hourly forecast
vintages), both from the Elexon Insights API.
""".strip()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Wind Desk API",
    description=DESCRIPTION,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins) or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health", include_in_schema=False)
def root_health() -> dict:
    return {"status": "ok", "service": "wind-desk-api"}


# --- optional single-container static hosting (the Docker image serves the SPA)
if settings.static_dir and settings.static_dir.exists():
    static_dir = settings.static_dir
    assets = static_dir / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        index = static_dir / "index.html"
        if full_path and (static_dir / full_path).exists():
            return FileResponse(static_dir / full_path)
        if index.exists():
            return FileResponse(index)
        return JSONResponse({"detail": "not found"}, status_code=404)
