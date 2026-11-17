"""SQLite schema (docs/04-BACKEND-SCHEMA.md §3), created by controlled, versioned initialisation.

`apply_schema` is idempotent: it creates missing tables and records the schema version.
A future change adds a new numbered step to MIGRATIONS; existing steps are never edited.
"""

import sqlite3

SCHEMA_V1 = """
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    storage_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    file_hash TEXT NOT NULL UNIQUE,
    page_count INTEGER,
    chunk_count INTEGER,
    pages_with_warnings INTEGER,
    status TEXT NOT NULL,
    status_message TEXT,
    latest_job_id TEXT,
    embedding_model TEXT,
    embedding_dimension INTEGER,
    chunk_size_tokens INTEGER,
    chunk_overlap_tokens INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    indexed_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS ix_documents_created ON documents(created_at);

CREATE TABLE IF NOT EXISTS document_pages (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    char_count INTEGER NOT NULL,
    word_count INTEGER NOT NULL,
    token_count INTEGER NOT NULL,
    chunk_count INTEGER NOT NULL,
    text_status TEXT NOT NULL,
    warning_code TEXT,
    warning_message TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (document_id, page_number)
);

CREATE TABLE IF NOT EXISTS processing_jobs (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    trigger TEXT NOT NULL,
    status TEXT NOT NULL,
    current_stage TEXT,
    stage_details_json TEXT,
    started_at TEXT,
    completed_at TEXT,
    duration_ms INTEGER,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_jobs_status ON processing_jobs(status);

CREATE TABLE IF NOT EXISTS workflow_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL,
    stage TEXT,
    stage_status TEXT,
    message TEXT,
    details_json TEXT,
    error_code TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (resource_type, resource_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS queries (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    status TEXT NOT NULL,
    document_ids_json TEXT,
    answer TEXT,
    insufficient_evidence INTEGER NOT NULL DEFAULT 0,
    abstention_reason TEXT,
    flag_for_review INTEGER NOT NULL DEFAULT 0,
    review_reasons_json TEXT,
    model_name TEXT,
    embedding_model TEXT,
    retrieval_top_k INTEGER NOT NULL,
    retrieval_max_distance REAL,
    retrieved_count INTEGER,
    evidence_count INTEGER,
    citation_count INTEGER,
    query_embedding_duration_ms INTEGER,
    retrieval_duration_ms INTEGER,
    generation_duration_ms INTEGER,
    total_duration_ms INTEGER,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_queries_created ON queries(created_at);

-- Snapshots: no foreign key to documents, so history survives deletion (§3.15).
CREATE TABLE IF NOT EXISTS query_retrievals (
    id TEXT PRIMARY KEY,
    query_id TEXT NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
    rank INTEGER NOT NULL,
    chunk_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    filename TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    distance REAL NOT NULL,
    passed_threshold INTEGER NOT NULL,
    source_label TEXT,
    is_cited INTEGER NOT NULL DEFAULT 0,
    excerpt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS answer_feedback (
    id TEXT PRIMARY KEY,
    query_id TEXT NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
    rating TEXT NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evaluation_datasets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    description TEXT,
    seed_file TEXT NOT NULL,
    seed_checksum TEXT NOT NULL,
    case_count INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (name, version)
);

CREATE TABLE IF NOT EXISTS evaluation_dataset_documents (
    dataset_id TEXT NOT NULL REFERENCES evaluation_datasets(id) ON DELETE CASCADE,
    document_key TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    PRIMARY KEY (dataset_id, document_key)
);

CREATE TABLE IF NOT EXISTS evaluation_cases (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES evaluation_datasets(id) ON DELETE CASCADE,
    case_key TEXT NOT NULL,
    question TEXT NOT NULL,
    category TEXT NOT NULL,
    expected_behavior TEXT NOT NULL,
    expected_answer TEXT,
    answer_criteria_json TEXT,
    expected_sources_json TEXT,
    must_not_contain_json TEXT,
    tags_json TEXT,
    review_notes TEXT,
    position INTEGER NOT NULL,
    UNIQUE (dataset_id, case_key)
);

CREATE TABLE IF NOT EXISTS evaluation_runs (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES evaluation_datasets(id),
    status TEXT NOT NULL,
    configuration_json TEXT NOT NULL,
    summary_metrics_json TEXT,
    case_count INTEGER NOT NULL,
    completed_case_count INTEGER NOT NULL DEFAULT 0,
    failed_case_count INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    error_message TEXT,
    started_at TEXT,
    completed_at TEXT,
    duration_ms INTEGER,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evaluation_results (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
    case_id TEXT NOT NULL REFERENCES evaluation_cases(id),
    execution_status TEXT NOT NULL,
    error_code TEXT,
    error_message TEXT,
    failure_type TEXT,
    llm_attempt_count INTEGER,
    answer TEXT,
    insufficient_evidence INTEGER,
    abstention_reason TEXT,
    flag_for_review INTEGER,
    review_reasons_json TEXT,
    retrieved_pairs_json TEXT,
    precision_at_k REAL,
    recall_at_k REAL,
    reciprocal_rank REAL,
    abstention_correct INTEGER,
    citation_source_match INTEGER,
    must_not_contain_passed INTEGER,
    retrieval_duration_ms INTEGER,
    generation_duration_ms INTEGER,
    latency_ms INTEGER,
    llm_judge_json TEXT,
    scoring_method_json TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (run_id, case_id)
);

CREATE TABLE IF NOT EXISTS evaluation_result_retrievals (
    id TEXT PRIMARY KEY,
    result_id TEXT NOT NULL REFERENCES evaluation_results(id) ON DELETE CASCADE,
    rank INTEGER NOT NULL,
    chunk_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    filename TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    distance REAL NOT NULL,
    passed_threshold INTEGER NOT NULL,
    source_label TEXT,
    is_cited INTEGER NOT NULL DEFAULT 0,
    excerpt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evaluation_reviews (
    id TEXT PRIMARY KEY,
    result_id TEXT NOT NULL UNIQUE REFERENCES evaluation_results(id) ON DELETE CASCADE,
    correctness_rating TEXT NOT NULL,
    faithfulness_rating TEXT NOT NULL,
    citation_validity TEXT NOT NULL,
    reviewer_comment TEXT,
    reviewer_label TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""

MIGRATIONS: list[str] = [SCHEMA_V1]


def apply_schema(conn: sqlite3.Connection) -> int:
    """Brings the database to the latest schema version and returns that version."""
    conn.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)")
    row = conn.execute("SELECT MAX(version) FROM schema_version").fetchone()
    current = row[0] or 0
    for version, script in enumerate(MIGRATIONS, start=1):
        if version > current:
            conn.executescript(script)
            conn.execute("INSERT INTO schema_version (version) VALUES (?)", (version,))
    conn.commit()
    return len(MIGRATIONS)
