import threading
from pathlib import Path

from app.db.sqlite import check_database, connect, init_database


def test_init_creates_database_in_wal_mode(tmp_path: Path) -> None:
    db_path = tmp_path / "nested" / "app.db"
    init_database(db_path)
    assert db_path.is_file()
    conn = connect(db_path)
    try:
        assert conn.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert conn.execute("PRAGMA busy_timeout").fetchone()[0] == 5000
    finally:
        conn.close()


def test_write_and_read_round_trip(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    conn = connect(db_path)
    try:
        conn.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)")
        with conn:
            conn.execute("INSERT INTO t (v) VALUES (?)", ("hello",))
        assert conn.execute("SELECT v FROM t").fetchone()["v"] == "hello"
    finally:
        conn.close()


def test_one_connection_per_thread(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    init_database(db_path)
    results: list[bool] = []

    def worker() -> None:
        results.append(check_database(db_path))

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert results == [True] * 4


def test_check_database_returns_false_on_failure(tmp_path: Path) -> None:
    # A directory cannot be opened as a database file.
    bad_path = tmp_path / "not_a_db"
    bad_path.mkdir()
    assert check_database(bad_path) is False
