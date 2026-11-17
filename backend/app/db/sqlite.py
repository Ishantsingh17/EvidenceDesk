"""SQLite connection foundation.

Rules from TRD §6.3: WAL journal mode, foreign keys on, a busy timeout, one
connection per thread (here: one per unit of work), short write transactions.
"""

import json
import logging
import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.db.schema import apply_schema

logger = logging.getLogger(__name__)

BUSY_TIMEOUT_MS = 5000


def connect(db_path: Path) -> sqlite3.Connection:
    """Open a configured connection. Use it from a single thread."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=BUSY_TIMEOUT_MS / 1000, check_same_thread=True)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_MS}")
    return conn


@contextmanager
def transaction(db_path: Path) -> Iterator[sqlite3.Connection]:
    """A short unit of work: commits on success, rolls back on error, always closes."""
    conn = connect(db_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_database(db_path: Path) -> None:
    """Create the database file, confirm WAL mode and apply the schema."""
    conn = connect(db_path)
    try:
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        if mode.lower() != "wal":
            raise RuntimeError(f"SQLite journal mode is {mode!r}, expected 'wal'")
        version = apply_schema(conn)
    finally:
        conn.close()
    logger.info("SQLite ready (journal_mode=wal, schema_version=%s)", version)


def check_database(db_path: Path) -> bool:
    """Return True if the database answers a query in WAL mode with foreign keys on."""
    try:
        conn = connect(db_path)
        try:
            ok = conn.execute("SELECT 1").fetchone()[0] == 1
            wal = conn.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
            fk = conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
            return ok and wal and fk
        finally:
            conn.close()
    except sqlite3.Error as exc:
        # Log only the exception type; never paths or SQL contents.
        logger.warning("SQLite health check failed: %s", type(exc).__name__)
        return False


def now_iso() -> str:
    """UTC timestamp in ISO 8601 with a trailing Z."""
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def new_id() -> str:
    return str(uuid.uuid4())


def dumps(value: Any) -> str | None:
    return None if value is None else json.dumps(value, ensure_ascii=False)


def loads(value: str | None, default: Any = None) -> Any:
    return default if value is None else json.loads(value)
