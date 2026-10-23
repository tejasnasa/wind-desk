"""Vercel serverless entrypoint.

Vercel builds this file as a Python function and detects the FastAPI
application object exposed as ``app``.  The whole repository is bundled into
the function, so the pre-seeded SQLite store travels with it.

The store is opened read-only: a serverless filesystem is immutable, and the
analytics layer only ever reads.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"

if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

# The database ships inside the function bundle.
os.environ.setdefault("WIND_DB_PATH", str(BACKEND / "data" / "wind.db"))
os.environ.setdefault("SQLITE_READONLY", "1")
os.environ.setdefault("CORS_ORIGINS", "*")

from app.main import app  # noqa: E402  (path setup must happen first)

__all__ = ["app"]
