"""SQLite connection foundation.

Rules from TRD §6.3: WAL journal mode, foreign keys on, a busy timeout, one
connection per thread, short write transactions. Tables are added in later
phases; this module only provides connections and a health check.
"""

import logging
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)

BUSY_TIMEOUT_MS = 5000


def connect(db_path: Path) -> sqlite3.Connection:
    """Open a configured connection. Use one connection per thread."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=BUSY_TIMEOUT_MS / 1000)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_MS}")
    return conn


def init_database(db_path: Path) -> None:
    """Create the database file (if needed) and confirm WAL mode is active."""
    conn = connect(db_path)
    try:
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        if mode.lower() != "wal":
            raise RuntimeError(f"SQLite journal mode is {mode!r}, expected 'wal'")
    finally:
        conn.close()
    logger.info("SQLite ready (journal_mode=wal)")


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
