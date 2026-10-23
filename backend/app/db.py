"""SQLAlchemy engine/session plumbing.

The pilot dataset is small (~30k forecast rows), so SQLite is the default store:
it keeps ``docker compose up`` dependency-free and lets the pre-built database
file ship inside the Vercel function bundle.  ``DATABASE_URL`` can point at
Postgres without touching application code.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import settings


def _database_url() -> str:
    """Build the SQLAlchemy URL.

    On serverless platforms the filesystem is immutable, so SQLite is opened
    in read-only URI mode (``SQLITE_READONLY=1``) to avoid any attempt to
    create a journal file.
    """
    if (
        settings.database_url.startswith("sqlite")
        and os.getenv("SQLITE_READONLY") == "1"
    ):
        path = settings.db_path.as_posix()
        return f"sqlite:///file:{path}?mode=ro&uri=true"
    return settings.database_url


_connect_args = {}
if settings.database_url.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}

engine = create_engine(
    _database_url(),
    future=True,
    connect_args=_connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope around a series of operations."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_session() -> Iterator[Session]:
    """FastAPI dependency."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
