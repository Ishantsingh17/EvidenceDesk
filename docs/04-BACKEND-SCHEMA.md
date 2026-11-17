# Backend Schema and API Contract

## AI-Powered Enterprise Document Retrieval & Evidence Assistant

| Field | Value |
|---|---|
| Document type | Backend data model and API contract |
| Version | 1.2 |
| Status | Baseline for POC implementation — revised 2026-11-17: evaluation dataset format and behaviours (DD-42) |
| API base path | `/api/v1` |

This document is the **single source of truth** for status values, stage names, event shapes, error codes, evaluation categories, and API response shapes. Other documents reference it rather than redefining these values.

---

## 1. Schema conventions

- IDs are UUID strings unless otherwise stated. `workflow_events.id` is an auto-increment integer.
- Timestamps are ISO 8601 UTC strings.
- API request and response bodies use JSON, except file uploads (`multipart/form-data`) and SSE event streams (`text/event-stream`).
- Database tables use snake_case names and columns. Booleans are stored as SQLite `INTEGER` (0/1).
- API fields use snake_case for consistency with Python/Pydantic. The frontend should consume generated or shared TypeScript types rather than rename fields ad hoc.
- Do not expose local absolute file paths, storage names, credentials, stack traces, or full internal configuration.
- `file_hash` (SHA-256 hex) is a content identifier, not a secret or a path, and may be returned to the frontend.
- URL fields such as `events_url` and `result_url` are absolute paths from the API origin (for example `/api/v1/jobs/{id}/events`). The frontend resolves them with `new URL(path, VITE_API_BASE_URL)`; it must not concatenate them onto the base URL.
- Errors raised during background execution (document jobs, queries, evaluation runs) are recorded as `error_code` / `error_message` on the resource and in its terminal event. HTTP error statuses apply only to synchronous request handling.
- This is a single-user local POC schema. Authentication, tenant IDs, and enterprise role permissions are not implemented in the MVP.

## 2. Status, stage, and category vocabularies

Document status, processing-job status, and processing stage are **separate fields** with separate value sets.

### 2.1 Document status (`documents.status`)

| Value | Meaning | Searchable? |
|---|---|---|
| `queued` | Accepted and validated; waiting for a processing job to start. | No |
| `processing` | A processing job is running. | No |
| `completed` | All pages extracted and indexed without warnings. | Yes |
| `completed_with_warnings` | Indexed, but one or more pages had little or no extractable text. At least one chunk was indexed. | Yes |
| `failed` | Processing failed (including interruption by a server restart). Reprocess is available. | No |
| `needs_ocr` | No page contained usable extractable text. OCR is not supported in the MVP. | No |
| `delete_failed` | A deletion removed the vectors but the local file could not be removed. Delete can be retried. | No |

### 2.2 Processing-job status (`processing_jobs.status`)

`queued`, `running`, `completed`, `completed_with_warnings`, `failed`.

### 2.3 Processing stage (`processing_jobs.current_stage`, `workflow_events.stage`)

| Stage | When it runs | Notes |
|---|---|---|
| `validation` | Synchronously inside `POST /documents/upload` (or `POST /documents/{id}/reprocess`) before the job is queued. | Recorded as the job's first persisted event with `stage_status: completed`, so the timeline can show it truthfully. |
| `text_extraction` | Background job. | Writes `document_pages` rows. |
| `chunking` | Background job. | |
| `embedding_generation` | Background job. | Runs outside the event loop. |
| `vector_indexing` | Background job. | |

`completed` is a **status**, never a stage.

### 2.4 Document status ↔ job status

| Situation | `processing_jobs.status` | `documents.status` | `error_code` |
|---|---|---|---|
| Job created after validation | `queued` | `queued` | — |
| Job running | `running` | `processing` | — |
| All stages succeeded, no page warnings | `completed` | `completed` | — |
| All stages succeeded, some page warnings | `completed_with_warnings` | `completed_with_warnings` | — |
| No usable text on any page | `failed` | `needs_ocr` | `NO_EXTRACTABLE_TEXT` |
| Any other stage failure | `failed` | `failed` | stage-specific code |
| Interrupted by server restart | `failed` | `failed` | `JOB_INTERRUPTED` |

### 2.5 Stage state (derived, per stage)

Used in `GET /jobs/{id}` and in UI timelines: `pending` (no event yet), `active` (started, not finished), `completed`, `failed`, `skipped`. A completed stage may carry `details.warning_count > 0`.

### 2.6 Query status (`queries.status`)

`queued`, `running`, `completed`, `insufficient_evidence`, `failed`.

`insufficient_evidence` is a **normal, successful outcome** returned with HTTP 200. It is never an API error.

Query stages: `query_received`, `query_embedding`, `retrieval`, `context_preparation`, `generation`, `citation_validation`.

Abstention reasons (`queries.abstention_reason`): `no_retrieval_results`, `below_evidence_threshold`, `model_reported_insufficient`, `no_valid_citations`.

### 2.7 Evaluation run status (`evaluation_runs.status`)

`queued`, `running`, `completed`, `completed_with_errors`, `failed`.

- `completed`: every case executed successfully.
- `completed_with_errors`: at least one case completed and at least one case failed.
- `failed`: run-level failure, interruption, or every case failed.

Evaluation stages: `preflight`, `case_execution`, `metric_aggregation`.

Per-case execution status (`evaluation_results.execution_status`): `completed`, `failed`.

Per-case failure type (`evaluation_results.failure_type`, set only when `failed`):

- `infrastructure`: an external dependency or the environment failed (Groq rate limit, timeout, authentication, 5xx/connection error; vector store unavailable), including after all attempts were exhausted (§9.8).
- `pipeline`: any other case failure (for example `LLM_RESPONSE_INVALID` or `INTERNAL_ERROR`).

### 2.8 Evaluation categories (`evaluation_cases.category`)

| Category | Meaning | Allowed `expected_behavior` |
|---|---|---|
| `direct` | Fact clearly stated in one document (may be paraphrased; use tag `paraphrase` for different-wording boundary cases). | `answer` |
| `multi_document` | Answer requires evidence from more than one document. | `answer` |
| `ambiguous` | Question is underspecified; a good answer states the ambiguity and the interpretations supported by evidence, and asks the user to specify. There is no follow-up turn (no conversation memory), so the clarification is part of a cited answer. | `qualified_answer` |
| `conflicting_documents` | Documents contain inconsistent or outdated information; a good answer surfaces both sources and the conflict. It does not pick a version on its own authority, but it applies any rule the documents themselves give (for example an effective date). | `qualified_answer` |
| `unanswerable` | In-domain question whose answer is not in the corpus. | `abstain` |
| `out_of_scope` | Question unrelated to the corpus domain. | `abstain` |
| `prompt_injection` | Corpus or question contains embedded instructions; the system must not follow them. | `answer`, `abstain`, or `refuse_unsafe_request` |

`expected_behavior` values (evaluation only; they never appear in the live query API, DD-42):

| Value | Meaning | How it is scored |
|---|---|---|
| `answer` | The corpus supports a direct answer with citations. | Abstention correctness: correct when the pipeline did not abstain. |
| `qualified_answer` | The corpus supports an answer that must carry a qualification: the ambiguity, the interpretations, the conflict, or the rule that resolves it. | As `answer`; human review checks the qualification is stated. |
| `abstain` | The corpus does not contain the answer; the pipeline should return `insufficient_evidence`. | Correct when the pipeline returned `insufficient_evidence`. No expected sources. |
| `refuse_unsafe_request` | The **user's own request** asks for something the system must never provide (for example secrets or hidden instructions). An unsafe instruction that exists only inside a document is not enough: such cases use `answer` or `abstain`. | Excluded from abstention correctness (either a refusal answer or an abstention can be safe). Scored by the `must_not_contain` check (§9.4), which is required, and by human review. |

## 3. Core data model (SQLite)

SQLite runs in WAL mode with foreign keys enabled and a busy timeout (see `docs/02-TRD.md` §6.3). Use migrations or a clearly versioned schema setup. Avoid silently changing existing column meanings.

### 3.1 `documents`

| Column | Type | Required | Description |
|---|---|---:|---|
| `id` | TEXT / UUID | Yes | Primary key. |
| `filename` | TEXT | Yes | Safe display filename (basename, control characters removed, max 255 chars). |
| `storage_name` | TEXT | Yes | Generated UUID storage name. Internal only. |
| `file_path` | TEXT | Yes | Path relative to `UPLOAD_DIR`. Internal only; never returned. |
| `mime_type` | TEXT | Yes | Detected MIME type. |
| `file_size_bytes` | INTEGER | Yes | File size in bytes. |
| `file_hash` | TEXT | Yes | SHA-256 hex. **UNIQUE** — duplicates are rejected. |
| `page_count` | INTEGER | No | Number of pages detected. |
| `chunk_count` | INTEGER | No | Number of chunks indexed. |
| `pages_with_warnings` | INTEGER | No | Count of pages with `low_text` or `no_text`. |
| `status` | TEXT | Yes | See §2.1. |
| `status_message` | TEXT | No | Safe user-facing status/error message. |
| `latest_job_id` | TEXT / UUID | No | Most recent processing job. |
| `embedding_model` | TEXT | No | Model used for the indexed vectors. |
| `embedding_dimension` | INTEGER | No | Vector dimension used. |
| `chunk_size_tokens` | INTEGER | No | Chunk size used. |
| `chunk_overlap_tokens` | INTEGER | No | Overlap used. |
| `created_at` | TEXT | Yes | Upload timestamp. |
| `updated_at` | TEXT | Yes | Last update timestamp. |
| `indexed_at` | TEXT | No | Time indexing last succeeded. |

Indexes: UNIQUE `file_hash`; index `status`, `created_at`.

### 3.2 `document_pages`

Page-level extraction statistics and warnings. Page text itself is not stored in SQLite; chunk text is stored in ChromaDB.

| Column | Type | Required | Description |
|---|---|---:|---|
| `id` | TEXT / UUID | Yes | Primary key. |
| `document_id` | TEXT / UUID | Yes | FK → `documents.id`, cascade delete. |
| `page_number` | INTEGER | Yes | One-based page number. |
| `char_count` | INTEGER | Yes | Extracted characters (after whitespace normalisation). |
| `word_count` | INTEGER | Yes | Extracted words. |
| `token_count` | INTEGER | Yes | Tokens counted with the embedding model's tokenizer. |
| `chunk_count` | INTEGER | Yes | Chunks produced from this page. |
| `text_status` | TEXT | Yes | `ok`, `low_text`, or `no_text`. |
| `warning_code` | TEXT | No | `LOW_TEXT_PAGE` or `NO_TEXT_PAGE`. |
| `warning_message` | TEXT | No | Safe user-facing warning. |
| `created_at` | TEXT | Yes | Creation timestamp. |

Constraint: UNIQUE (`document_id`, `page_number`). Rows are replaced on reprocess. `low_text` is determined by the configurable `MIN_PAGE_TEXT_CHARS` setting (provisional default; see TRD §17).

### 3.3 `processing_jobs`

| Column | Type | Required | Description |
|---|---|---:|---|
| `id` | TEXT / UUID | Yes | Job ID. |
| `document_id` | TEXT / UUID | Yes | FK → `documents.id`, cascade delete. |
| `attempt_number` | INTEGER | Yes | 1 for upload; incremented per reprocess. |
| `trigger` | TEXT | Yes | `upload` or `reprocess`. |
| `status` | TEXT | Yes | See §2.2. |
| `current_stage` | TEXT | No | See §2.3. Null when not running. |
| `stage_details_json` | TEXT | No | Safe per-stage counts and durations. |
| `started_at` | TEXT | No | Start time. |
| `completed_at` | TEXT | No | End time. |
| `duration_ms` | INTEGER | No | Total duration. |
| `error_code` | TEXT | No | Stable error code if failed. |
| `error_message` | TEXT | No | Safe user-facing error. |
| `created_at` | TEXT | Yes | Creation timestamp. |
| `updated_at` | TEXT | Yes | Last update timestamp. |

Every reprocess creates a **new** job row; previous jobs are kept as history until the document is deleted.

### 3.4 `workflow_events`

Ordered, persisted status events for document jobs, queries, and evaluation runs. This is the source of truth for SSE replay and timeline recovery.

| Column | Type | Required | Description |
|---|---|---:|---|
| `id` | INTEGER | Yes | Auto-increment primary key; exposed as `event_id`. |
| `resource_type` | TEXT | Yes | `document_job`, `query`, or `evaluation_run`. |
| `resource_id` | TEXT / UUID | Yes | Related job, query, or run ID. |
| `sequence_number` | INTEGER | Yes | Starts at 1; monotonically increasing within the resource. |
| `event_type` | TEXT | Yes | `stage` or `terminal`. Heartbeats are not persisted. |
| `status` | TEXT | Yes | Resource status at the time of the event. |
| `stage` | TEXT | No | Stage name. |
| `stage_status` | TEXT | No | `started`, `completed`, `failed`, or `skipped`. |
| `message` | TEXT | No | Safe user-facing progress message. |
| `details_json` | TEXT | No | Safe counts, durations, and structured details. |
| `error_code` | TEXT | No | Stable error code for failed stages/terminal events. |
| `created_at` | TEXT | Yes | Event timestamp. |

Constraint: UNIQUE (`resource_type`, `resource_id`, `sequence_number`). Do not store credentials, full document contents, prompts, or hidden model reasoning in events. Events for a document's jobs are deleted with the document; query and evaluation events are retained.

### 3.5 `queries`

User-submitted questions only. **Evaluation runs never write to this table**, so dashboard query statistics are not distorted.

| Column | Type | Required | Description |
|---|---|---:|---|
| `id` | TEXT / UUID | Yes | Query ID. |
| `question` | TEXT | Yes | User question. |
| `status` | TEXT | Yes | See §2.6. |
| `document_ids_json` | TEXT | No | Document filter snapshot; null = all searchable documents. |
| `answer` | TEXT | No | Validated answer, or the standard abstention message. |
| `insufficient_evidence` | INTEGER | Yes | 1 when status is `insufficient_evidence`. |
| `abstention_reason` | TEXT | No | See §2.6. |
| `flag_for_review` | INTEGER | Yes | Final flag after backend validation (§7). |
| `review_reasons_json` | TEXT | No | JSON array of review reason codes. |
| `model_name` | TEXT | No | Configured Groq model ID (null if generation skipped). |
| `embedding_model` | TEXT | No | Embedding model used. |
| `retrieval_top_k` | INTEGER | Yes | Candidates requested. |
| `retrieval_max_distance` | REAL | No | Threshold snapshot; null when uncalibrated. |
| `retrieved_count` | INTEGER | No | Candidates returned by ChromaDB. |
| `evidence_count` | INTEGER | No | Chunks passed to the LLM. |
| `citation_count` | INTEGER | No | Final validated citations. |
| `query_embedding_duration_ms` | INTEGER | No | Query embedding duration. |
| `retrieval_duration_ms` | INTEGER | No | Vector search duration. |
| `generation_duration_ms` | INTEGER | No | LLM duration. |
| `total_duration_ms` | INTEGER | No | End-to-end duration. |
| `prompt_tokens` | INTEGER | No | Provider-reported usage, if available. |
| `completion_tokens` | INTEGER | No | Provider-reported usage, if available. |
| `error_code` | TEXT | No | Stable error code if failed. |
| `error_message` | TEXT | No | Safe user-facing error. |
| `created_at` | TEXT | Yes | Creation timestamp. |
| `completed_at` | TEXT | No | Completion timestamp. |

### 3.6 `query_retrievals`

Every candidate chunk retrieved for a query, in rank order. Rows are **snapshots** and are preserved when the source document is deleted (no cascading FK to `documents`).

| Column | Type | Required | Description |
|---|---|---:|---|
| `id` | TEXT / UUID | Yes | Primary key. |
| `query_id` | TEXT / UUID | Yes | FK → `queries.id`. |
| `rank` | INTEGER | Yes | Retrieval rank, starting at 1. |
| `chunk_id` | TEXT | Yes | Chroma chunk ID (snapshot). |
| `document_id` | TEXT / UUID | Yes | Source document ID (snapshot; may no longer exist). |
| `file_hash` | TEXT | Yes | Source file SHA-256 (snapshot). |
| `filename` | TEXT | Yes | Source display name (snapshot). |
| `page_number` | INTEGER | Yes | One-based page number. |
| `chunk_index` | INTEGER | Yes | Chunk position within the document. |
| `distance` | REAL | Yes | Raw Chroma cosine distance; lower is closer. |
| `passed_threshold` | INTEGER | Yes | 1 if retained as evidence (always 1 when no threshold is configured). |
| `source_label` | TEXT | No | `S1`, `S2`, … if passed to the LLM; null otherwise. |
| `is_cited` | INTEGER | Yes | 1 if the label survived citation validation. |
| `excerpt` | TEXT | Yes | Chunk text (snapshot). |

### 3.7 `answer_feedback`

| Column | Type | Required | Description |
|---|---|---:|---|
| `id` | TEXT / UUID | Yes | Primary key. |
| `query_id` | TEXT / UUID | Yes | Related query. |
| `rating` | TEXT | Yes | `helpful` or `not_helpful`. |
| `comment` | TEXT | No | Optional comment. |
| `created_at` | TEXT | Yes | Creation timestamp. |

### 3.8 `evaluation_datasets`

Loaded from versioned JSON seed files (§8). A `(name, version)` pair is immutable.

| Column | Type | Required | Description |
|---|---|---:|---|
| `id` | TEXT / UUID | Yes | Dataset ID. |
| `name` | TEXT | Yes | Dataset name. |
| `version` | TEXT | Yes | Semantic version from the seed file. |
| `description` | TEXT | No | Purpose and coverage. |
| `seed_file` | TEXT | Yes | Seed filename (relative to `EVALUATION_DATASET_DIR`). |
| `seed_checksum` | TEXT | Yes | SHA-256 of the seed file content. |
| `case_count` | INTEGER | Yes | Number of cases. |
| `created_at` | TEXT | Yes | Load timestamp. |

Constraint: UNIQUE (`name`, `version`). If a seed file's checksum differs from the stored checksum for the same name and version, the loader refuses to load it and logs an error; a changed dataset requires a new version.

### 3.9 `evaluation_dataset_documents`

Required corpus for a dataset, identified by SHA-256. Only these documents are checked by evaluation preflight; other indexed documents do not block a run (DD-18).

| Column | Type | Required | Description |
|---|---|---:|---|
| `dataset_id` | TEXT / UUID | Yes | FK → `evaluation_datasets.id`. |
| `document_key` | TEXT | Yes | Stable key from the seed file. |
| `filename` | TEXT | Yes | Expected display filename. |
| `file_hash` | TEXT | Yes | Expected SHA-256. |

Constraint: PRIMARY KEY (`dataset_id`, `document_key`).

### 3.10 `evaluation_cases`

| Column | Type | Required | Description |
|---|---|---:|---|
| `id` | TEXT / UUID | Yes | Case ID. |
| `dataset_id` | TEXT / UUID | Yes | Parent dataset. |
| `case_key` | TEXT | Yes | Stable key from the seed file. |
| `question` | TEXT | Yes | Evaluation question. |
| `category` | TEXT | Yes | See §2.8. |
| `expected_behavior` | TEXT | Yes | `answer`, `qualified_answer`, `abstain`, or `refuse_unsafe_request` (§2.8). |
| `expected_answer` | TEXT | No | Reference answer. |
| `answer_criteria_json` | TEXT | No | JSON array of rubric criteria for human review. |
| `expected_sources_json` | TEXT | No | JSON array of `{file_hash, page_number}`; empty for abstain cases. |
| `must_not_contain_json` | TEXT | No | JSON array of strings that must not appear in the answer (prompt-injection checks). |
| `tags_json` | TEXT | No | JSON array of free-form tags (for example `paraphrase`). |
| `review_notes` | TEXT | No | Ground-truth explanation. |

Constraint: UNIQUE (`dataset_id`, `case_key`).

### 3.11 `evaluation_runs`

| Column | Type | Required | Description |
|---|---|---:|---|
| `id` | TEXT / UUID | Yes | Run ID. |
| `dataset_id` | TEXT / UUID | Yes | Dataset executed. |
| `status` | TEXT | Yes | See §2.7. |
| `configuration_json` | TEXT | Yes | Safe snapshot: top-k, threshold, calibration flag, models, chunk settings, prompt version. |
| `summary_metrics_json` | TEXT | No | Rule-based and measured metric summary (§9). Human-review aggregates are computed on read. |
| `case_count` | INTEGER | Yes | Cases in the dataset. |
| `completed_case_count` | INTEGER | Yes | Cases executed successfully. |
| `failed_case_count` | INTEGER | Yes | Cases that failed. |
| `error_code` | TEXT | No | Run-level error code. |
| `error_message` | TEXT | No | Safe run-level error. |
| `started_at` | TEXT | No | Start time. |
| `completed_at` | TEXT | No | Completion time. |
| `duration_ms` | INTEGER | No | Total duration. |
| `created_at` | TEXT | Yes | Creation timestamp. |

### 3.12 `evaluation_results`

One row per case per run.

| Column | Type | Required | Description |
|---|---|---:|---|
| `id` | TEXT / UUID | Yes | Result ID. |
| `run_id` | TEXT / UUID | Yes | Related run. |
| `case_id` | TEXT / UUID | Yes | Evaluated case. |
| `execution_status` | TEXT | Yes | `completed` or `failed`. |
| `error_code` | TEXT | No | Case-level error code. |
| `error_message` | TEXT | No | Safe case-level error. |
| `failure_type` | TEXT | No | `infrastructure` or `pipeline` (§2.7); null when completed. |
| `llm_attempt_count` | INTEGER | No | Groq attempts made for this case (1 to `GROQ_MAX_ATTEMPTS`, i.e. 1–3); null if generation was skipped. |
| `answer` | TEXT | No | Validated generated answer or abstention message. |
| `insufficient_evidence` | INTEGER | No | Pipeline abstained. |
| `abstention_reason` | TEXT | No | See §2.6. |
| `flag_for_review` | INTEGER | No | Final validation flag. |
| `review_reasons_json` | TEXT | No | Review reason codes. |
| `retrieved_pairs_json` | TEXT | No | Deduplicated ranked list of `{file_hash, page_number}` (§9). |
| `precision_at_k` | REAL | No | Null when not applicable. |
| `recall_at_k` | REAL | No | Null when not applicable. |
| `reciprocal_rank` | REAL | No | Null when not applicable. |
| `abstention_correct` | INTEGER | No | Rule-based (§9). |
| `citation_source_match` | INTEGER | No | Rule-based: every cited `(file_hash, page)` is in the expected sources. Null when not applicable. |
| `must_not_contain_passed` | INTEGER | No | Rule-based; null when the case has no `must_not_contain`. |
| `retrieval_duration_ms` | INTEGER | No | Retrieval duration. |
| `generation_duration_ms` | INTEGER | No | Generation duration. |
| `latency_ms` | INTEGER | No | End-to-end case latency. |
| `llm_judge_json` | TEXT | No | Stretch only: LLM-judge scores with judge model and prompt version, labelled as automated estimates. |
| `scoring_method_json` | TEXT | Yes | Methods used per metric (`rule_based`, `measured`, `llm_judge`). |
| `created_at` | TEXT | Yes | Creation timestamp. |

Constraint: UNIQUE (`run_id`, `case_id`).

### 3.13 `evaluation_result_retrievals`

Retrieved chunks per evaluation result, with the same columns as `query_retrievals` except `query_id` is replaced by `result_id` (FK → `evaluation_results.id`). These are snapshots and survive document deletion.

### 3.14 `evaluation_reviews`

In-app human review, one per evaluation result (editable).

| Column | Type | Required | Description |
|---|---|---:|---|
| `id` | TEXT / UUID | Yes | Primary key. |
| `result_id` | TEXT / UUID | Yes | FK → `evaluation_results.id`; UNIQUE. |
| `correctness_rating` | TEXT | Yes | `correct`, `partially_correct`, `incorrect`, `not_applicable`. |
| `faithfulness_rating` | TEXT | Yes | `faithful`, `partially_faithful`, `unfaithful`, `not_applicable`. |
| `citation_validity` | TEXT | Yes | `valid`, `partially_valid`, `invalid`, `not_applicable`. |
| `reviewer_comment` | TEXT | No | Free-text comment. |
| `reviewer_label` | TEXT | No | Optional reviewer name/initials. Not an authenticated identity. |
| `created_at` | TEXT | Yes | Creation timestamp. |
| `updated_at` | TEXT | Yes | Last update timestamp. |

### 3.15 Retention on document deletion

| Data | On hard deletion of a document |
|---|---|
| Uploaded file | Deleted. |
| ChromaDB vectors (`document_id`) | Deleted. |
| `documents`, `document_pages`, `processing_jobs`, job `workflow_events` | Deleted. |
| `queries`, `query_retrievals`, `answer_feedback` | Preserved as historical snapshots. |
| `evaluation_*` tables | Preserved. Expected sources use `file_hash`, so the dataset remains valid if the same file is re-uploaded. |

## 4. ChromaDB collection and metadata schema

Collection name: configured by `CHROMA_COLLECTION_NAME` (default `enterprise_document_chunks`).

### 4.1 Collection metadata and model guard

The backend opens the store with ChromaDB `PersistentClient`, using `CHROMA_PERSIST_DIR`. The `chromadb` version is pinned in `backend/requirements.txt`, and the exact parameter names below are confirmed against that pinned version.

The collection is created with:

- cosine distance (for example `{"hnsw:space": "cosine"}` or the equivalent configuration parameter of the installed ChromaDB version — confirm the API signature during implementation);
- `embedding_model`: configured model ID;
- `embedding_dimension`: dimension reported by the loaded model (384 for `all-MiniLM-L6-v2`);
- `schema_version`: `1`.

At startup, after the embedding model is loaded, the backend compares the configured model ID and actual dimension with the collection metadata. On mismatch:

- the application starts in a degraded state; `GET /health` reports `degraded` and `GET /settings/status` reports `vector_store_status: "model_mismatch"`;
- upload, reprocess, query, and evaluation requests return `503 EMBEDDING_MODEL_MISMATCH`;
- vectors from different models are never mixed. Resolution is a documented manual reset (delete `data/chroma/` and reprocess documents) or configuring a new collection name.

### 4.2 Chunk records

- `id`: deterministic chunk ID derived from `document_id`, `page_number`, and `chunk_index`.
- `document`: chunk text.
- `embedding`: vector from the configured Sentence Transformers model.
- `metadata`: `document_id`, `chunk_id`, `filename`, `page_number` (one-based), `chunk_index`, `file_hash`, `embedding_model`, `created_at`.

Queries filter by `document_id` to documents whose status is `completed` or `completed_with_warnings` (intersected with any request filter), so partially indexed documents are never retrieved.

Do not store a raw `similarity_percent`. Store the raw distance and, only if useful, calculate a clearly labelled transformed score with a documented formula.

## 5. API endpoints

All paths below are relative to `/api/v1`. Numeric values in examples are illustrative only and are not measured results.

### 5.1 Health

#### `GET /health`

```json
{
  "status": "healthy",
  "service": "enterprise-document-retrieval-api",
  "activity": { "ingestion_active": false, "evaluation_active": false },
  "timestamp": "2026-01-01T12:00:00Z"
}
```

`status`: `starting` (embedding model loading), `healthy`, or `degraded` (for example model mismatch or vector store unavailable). No secrets, paths, or stack traces.

`activity.ingestion_active` is true while any processing job is `queued` or `processing`. `activity.evaluation_active` is true while an evaluation run is `queued` or `running`. The frontend uses them to disable the upload, reprocess, delete, and run-evaluation controls with a reason (DD-02).

### 5.2 Dashboard

#### `GET /dashboard/summary`

```json
{
  "documents_total": 8,
  "documents_indexed": 7,
  "documents_with_warnings": 1,
  "documents_failed": 0,
  "documents_needs_ocr": 1,
  "queries_total": 24,
  "queries_insufficient_evidence": 3,
  "median_query_latency_ms": 1850,
  "query_latency_sample_count": 21,
  "latest_evaluation": {
    "run_id": "uuid",
    "status": "completed",
    "case_count": 20,
    "created_at": "2026-01-01T12:00:00Z"
  }
}
```

- `documents_indexed` counts `completed` + `completed_with_warnings`.
- Query statistics are calculated from the `queries` table only (user queries). Median latency uses queries with status `completed` or `insufficient_evidence`.
- Return `null` when a statistic cannot be calculated.

Recent documents and recent queries are fetched with `GET /documents?page_size=5` and `GET /queries?page_size=5`.

### 5.3 Documents

#### `POST /documents/upload`

- Content type: `multipart/form-data` with exactly **one** file field `file`. The frontend uploads multiple files as independent requests; each file has its own response, document, and job.
- Synchronous validation **before** any background processing, in this order: extension `.pdf`; size ≤ `MAX_UPLOAD_SIZE_MB` (enforced while streaming); `%PDF-` signature/MIME; SHA-256 duplicate check; PyMuPDF can open the file, it is not encrypted, and it has at least one page.
- The file is written to a temporary name in `UPLOAD_DIR`, then renamed to its generated UUID storage name only after validation passes. Rejected files are removed.
- Rejected with `409 EVALUATION_IN_PROGRESS` while an evaluation run is `queued` or `running` (DD-02). This check runs before the file is stored.
- On success: creates the document (`queued`), a processing job (`queued`, `attempt_number: 1`, `trigger: upload`), persists the `validation` completed event, and enqueues the job.

Response `202 Accepted`:

```json
{
  "document_id": "uuid",
  "filename": "payment-approval-policy-v1.pdf",
  "status": "queued",
  "job_id": "uuid",
  "events_url": "/api/v1/jobs/uuid/events"
}
```

Errors: `400 INVALID_FILE_TYPE`, `413 FILE_TOO_LARGE`, `409 DUPLICATE_DOCUMENT` (with `details: {"existing_document_id": "uuid", "existing_filename": "..."}`), `422 PDF_PARSE_FAILED`, `503 EMBEDDING_MODEL_MISMATCH`, `503 SERVICE_NOT_READY`.

#### `GET /documents`

Query parameters: `status` (one of §2.1), `search` (filename substring), `page` (default 1), `page_size` (default 20, max 100). Sorted by `created_at` descending.

```json
{
  "items": [
    {
      "id": "uuid",
      "filename": "payment-approval-policy-v1.pdf",
      "file_size_bytes": 248100,
      "page_count": 8,
      "chunk_count": 32,
      "pages_with_warnings": 0,
      "status": "completed",
      "status_message": null,
      "current_stage": null,
      "created_at": "2026-01-01T12:00:00Z",
      "updated_at": "2026-01-01T12:00:03Z"
    }
  ],
  "page": 1,
  "page_size": 20,
  "total": 1
}
```

`current_stage` is the latest job's current stage while the document is `processing`, otherwise null.

#### `GET /documents/{document_id}`

```json
{
  "id": "uuid",
  "filename": "payment-approval-policy-v1.pdf",
  "mime_type": "application/pdf",
  "file_size_bytes": 248100,
  "file_hash": "sha256-hex",
  "page_count": 8,
  "chunk_count": 30,
  "status": "completed_with_warnings",
  "status_message": "2 pages contained little or no extractable text.",
  "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
  "embedding_dimension": 384,
  "chunk_size_tokens": 220,
  "chunk_overlap_tokens": 40,
  "created_at": "2026-01-01T12:00:00Z",
  "updated_at": "2026-01-01T12:00:03Z",
  "indexed_at": "2026-01-01T12:00:03Z",
  "diagnostics": {
    "pages_total": 8,
    "pages_ok": 6,
    "pages_low_text": 1,
    "pages_no_text": 1,
    "total_characters": 18234,
    "warnings": [
      { "page_number": 7, "code": "LOW_TEXT_PAGE", "message": "Page 7 contains very little extractable text." },
      { "page_number": 8, "code": "NO_TEXT_PAGE", "message": "Page 8 has no extractable text (it may be scanned)." }
    ]
  },
  "pages": [
    {
      "page_number": 1,
      "char_count": 2410,
      "word_count": 402,
      "token_count": 530,
      "chunk_count": 4,
      "text_status": "ok",
      "warning_code": null,
      "warning_message": null
    }
  ],
  "latest_job": {
    "job_id": "uuid",
    "attempt_number": 1,
    "trigger": "upload",
    "status": "completed_with_warnings",
    "current_stage": null,
    "started_at": "2026-01-01T12:00:00Z",
    "completed_at": "2026-01-01T12:00:03Z",
    "duration_ms": 2870,
    "error_code": null,
    "error_message": null,
    "events_url": "/api/v1/jobs/uuid/events"
  },
  "actions": {
    "can_reprocess": true,
    "can_delete": true,
    "disabled_reason": null
  }
}
```

`actions.disabled_reason` explains why an action is unavailable (for example "Document is processing"). Never returns `file_path` or `storage_name`. Errors: `404 DOCUMENT_NOT_FOUND`.

#### `POST /documents/{document_id}/reprocess`

Re-runs ingestion for an existing document and **always creates a new processing job**.

- Allowed when the document status is `completed`, `completed_with_warnings`, `failed`, or `needs_ocr`.
- Rejected with `409 DOCUMENT_BUSY` when `queued` or `processing`, and with `409 DOCUMENT_BUSY` when `delete_failed` (finish the deletion instead).
- Rejected with `409 EVALUATION_IN_PROGRESS` while an evaluation run is `queued` or `running` (DD-02).
- Re-validates that the stored file exists and opens (`409 DOCUMENT_FILE_MISSING`, `422 PDF_PARSE_FAILED`).
- Removes the document's existing vectors and `document_pages`, sets the document to `queued`, creates a job with `trigger: reprocess` and incremented `attempt_number`, persists the `validation` completed event, and enqueues the job. The document is not searchable until the new job succeeds.

Response `202 Accepted`:

```json
{
  "document_id": "uuid",
  "job_id": "uuid",
  "attempt_number": 2,
  "status": "queued",
  "events_url": "/api/v1/jobs/uuid/events"
}
```

#### `DELETE /documents/{document_id}`

Hard deletion. Rejected with `409 DOCUMENT_BUSY` while the document is `queued` or `processing`, and with `409 EVALUATION_IN_PROGRESS` while an evaluation run is `queued` or `running` (DD-02).

Order of operations:

1. Delete vectors where `document_id` matches. On failure: `503 VECTOR_DELETE_FAILED`, nothing else changes.
2. Delete the local file. On failure: set the document status to `delete_failed` and return `200` with `result: "partially_deleted"`; the user can retry `DELETE`.
3. Delete `documents`, `document_pages`, `processing_jobs`, and job `workflow_events`.

Query and evaluation snapshots are preserved (§3.15).

Response `200 OK`:

```json
{
  "document_id": "uuid",
  "result": "deleted",
  "vectors_removed": true,
  "file_removed": true,
  "metadata_removed": true,
  "warnings": []
}
```

`result` is `deleted` or `partially_deleted`. Never report `deleted` while vectors or the file remain.

### 5.4 Jobs and processing events

#### `GET /jobs/{job_id}`

Persisted job state and stage history for refresh/reconnect recovery.

```json
{
  "job_id": "uuid",
  "document_id": "uuid",
  "attempt_number": 1,
  "trigger": "upload",
  "status": "running",
  "current_stage": "embedding_generation",
  "started_at": "2026-01-01T12:00:00Z",
  "completed_at": null,
  "duration_ms": null,
  "error_code": null,
  "error_message": null,
  "stages": [
    { "stage": "validation", "state": "completed", "started_at": "2026-01-01T12:00:00Z", "completed_at": "2026-01-01T12:00:00Z", "duration_ms": 41, "details": { "page_count": 8 } },
    { "stage": "text_extraction", "state": "completed", "started_at": "2026-01-01T12:00:00Z", "completed_at": "2026-01-01T12:00:01Z", "duration_ms": 310, "details": { "pages_ok": 6, "warning_count": 2 } },
    { "stage": "chunking", "state": "completed", "started_at": "2026-01-01T12:00:01Z", "completed_at": "2026-01-01T12:00:01Z", "duration_ms": 22, "details": { "chunk_count": 30 } },
    { "stage": "embedding_generation", "state": "active", "started_at": "2026-01-01T12:00:01Z", "completed_at": null, "duration_ms": null, "details": { "completed_items": 16, "total_items": 30 } },
    { "stage": "vector_indexing", "state": "pending", "started_at": null, "completed_at": null, "duration_ms": null, "details": null }
  ],
  "last_sequence_number": 7,
  "events_url": "/api/v1/jobs/uuid/events"
}
```

Errors: `404 JOB_NOT_FOUND`.

#### `GET /jobs/{job_id}/events`

SSE stream using the common envelope (§6). Supports `Last-Event-ID` replay.

### 5.5 Assistant queries

Each query is **independent**. There is no conversation memory in the MVP; previous questions and answers are never sent as context.

#### `POST /queries`

```json
{
  "question": "What is the approval process for vendor payments above the stated threshold?",
  "document_ids": null,
  "top_k": 4
}
```

- `question`: required, trimmed, 3 to `QUERY_MAX_CHARS` characters.
- `document_ids`: optional; `null` = all searchable documents. Every ID must reference a searchable document, otherwise `422 VALIDATION_ERROR`.
- `top_k`: optional; 1 to `RETRIEVAL_TOP_K_MAX`; defaults to `RETRIEVAL_TOP_K`.
- `409 NO_INDEXED_DOCUMENTS` if no searchable document exists; `503 EMBEDDING_MODEL_MISMATCH` / `503 SERVICE_NOT_READY` as applicable.

Response `202 Accepted`:

```json
{
  "query_id": "uuid",
  "status": "queued",
  "events_url": "/api/v1/queries/uuid/events",
  "result_url": "/api/v1/queries/uuid"
}
```

#### `GET /queries`

Query history (user queries only). Query parameters: `status`, `page` (default 1), `page_size` (default 20, max 100). Sorted by `created_at` descending.

```json
{
  "items": [
    {
      "id": "uuid",
      "question": "What is the approval process for vendor payments above the stated threshold?",
      "status": "completed",
      "insufficient_evidence": false,
      "flag_for_review": false,
      "citation_count": 2,
      "total_duration_ms": 1190,
      "created_at": "2026-01-01T12:00:00Z",
      "completed_at": "2026-01-01T12:00:01Z"
    }
  ],
  "page": 1,
  "page_size": 20,
  "total": 1
}
```

#### `GET /queries/{query_id}/events`

SSE stream using the common envelope (§6). Stage details:

| Stage | `details` keys |
|---|---|
| `query_received` | — |
| `query_embedding` | `duration_ms` |
| `retrieval` | `retrieved_count`, `duration_ms` |
| `context_preparation` | `evidence_count`, `threshold_applied` |
| `generation` | `model_name`, `duration_ms`; `stage_status: skipped` when the pipeline abstains before generation |
| `citation_validation` | `citation_count`, `flag_for_review`; skipped when generation was skipped |

#### `GET /queries/{query_id}`

Returns `200` for every existing query, including `queued`, `running`, `insufficient_evidence`, and `failed`. Errors: `404 QUERY_NOT_FOUND`.

```json
{
  "id": "uuid",
  "status": "completed",
  "question": "What is the approval process?",
  "answer": "Payments above the threshold require approval by the Finance Controller [S1] and a second approver [S2].",
  "insufficient_evidence": false,
  "abstention_reason": null,
  "flag_for_review": false,
  "review_reasons": [],
  "citations": [
    {
      "citation_id": "S1",
      "document_id": "uuid",
      "document_available": true,
      "filename": "payment-approval-policy-v1.pdf",
      "page_number": 4,
      "chunk_index": 12,
      "excerpt": "Payments above ... require ...",
      "retrieval_rank": 1,
      "distance": 0.31
    }
  ],
  "retrieval_details": {
    "top_k": 4,
    "threshold_applied": false,
    "max_distance": null,
    "evidence_threshold_calibrated": false,
    "chunks": [
      {
        "rank": 1,
        "source_label": "S1",
        "is_cited": true,
        "passed_threshold": true,
        "document_id": "uuid",
        "document_available": true,
        "filename": "payment-approval-policy-v1.pdf",
        "page_number": 4,
        "chunk_index": 12,
        "distance": 0.31,
        "excerpt": "Payments above ... require ..."
      }
    ]
  },
  "metrics": {
    "query_embedding_duration_ms": 12,
    "retrieval_duration_ms": 92,
    "generation_duration_ms": 980,
    "total_duration_ms": 1190,
    "retrieved_count": 4,
    "evidence_count": 4,
    "model_name": "configured-model-id"
  },
  "error_code": null,
  "error_message": null,
  "created_at": "2026-01-01T12:00:00Z",
  "completed_at": "2026-01-01T12:00:01Z"
}
```

- `citations` contains **only** chunks whose source label was cited and validated (§7).
- `retrieval_details.chunks` contains **all** retrieved candidates, cited or not, in rank order.
- `document_available` is false when the source document has since been deleted; the snapshot is still shown.
- For `insufficient_evidence`: `answer` is the standard abstention message, `citations` is `[]`, and `retrieval_details` still lists any retrieved candidates.

### 5.6 Answer feedback

#### `POST /queries/{query_id}/feedback`

```json
{ "rating": "helpful", "comment": "The policy excerpt supported the answer." }
```

Response `201 Created`:

```json
{ "feedback_id": "uuid", "status": "recorded" }
```

### 5.7 Evaluation

#### `GET /evaluations/datasets`

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "ap-policies",
      "version": "1.1.0",
      "description": "Synthetic AP/finance policy questions.",
      "case_count": 20,
      "categories": { "direct": 5, "multi_document": 3, "ambiguous": 2, "conflicting_documents": 3, "unanswerable": 3, "out_of_scope": 2, "prompt_injection": 2 },
      "corpus": [
        { "document_key": "payment_policy_v1", "filename": "01-payment-approval-policy-v1.pdf", "file_hash": "sha256-hex", "indexed": true }
      ],
      "corpus_ready": true
    }
  ]
}
```

#### `POST /evaluations/run`

```json
{ "dataset_id": "uuid", "top_k": 4 }
```

Preflight (synchronous): `404 EVALUATION_DATASET_NOT_FOUND`; `409 EVALUATION_ALREADY_RUNNING` (one run at a time); `409 INGESTION_IN_PROGRESS` when any processing job is `queued` or `processing` (DD-02); `409 EVALUATION_CORPUS_INCOMPLETE` with `details.missing: [{ "filename": "...", "file_hash": "..." }]` when a document referenced by **this dataset** is missing or not fully indexed (`completed` or `completed_with_warnings`) (DD-18); `503 EMBEDDING_MODEL_MISMATCH`. Indexed documents that the dataset does not reference do not block the run.

`corpus_ready` in `GET /evaluations/datasets` follows the same rule: it is true when every document referenced by that dataset is fully indexed.

Response `202 Accepted`:

```json
{
  "run_id": "uuid",
  "status": "queued",
  "events_url": "/api/v1/evaluations/runs/uuid/events",
  "result_url": "/api/v1/evaluations/runs/uuid"
}
```

Cases execute sequentially through the shared RAG pipeline **without** writing `queries` or `query_retrievals` rows.

#### `GET /evaluations/runs`

Paginated list (`page`, `page_size`) of runs with `run_id`, dataset name/version, `status`, `case_count`, `completed_case_count`, `failed_case_count`, `created_at`, `duration_ms`, and the rule-based summary.

#### `GET /evaluations/runs/{run_id}`

```json
{
  "run_id": "uuid",
  "dataset": { "id": "uuid", "name": "ap-policies", "version": "1.1.0" },
  "status": "completed_with_errors",
  "configuration": {
    "top_k": 4,
    "retrieval_max_distance": null,
    "evidence_threshold_calibrated": false,
    "llm_model": "configured-model-id",
    "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
    "chunk_size_tokens": 220,
    "chunk_overlap_tokens": 40,
    "prompt_version": "v1"
  },
  "case_count": 20,
  "completed_case_count": 19,
  "failed_case_count": 1,
  "infrastructure_failure_count": 1,
  "pipeline_failure_count": 0,
  "started_at": "2026-01-01T12:00:00Z",
  "completed_at": "2026-01-01T12:01:10Z",
  "duration_ms": 70000,
  "error_code": null,
  "error_message": null,
  "summary": {
    "retrieval": {
      "method": "rule_based",
      "relevance_unit": "unique (file_hash, page_number)",
      "precision_at_k": { "value": 0.5, "sample_count": 13, "excluded_count": 6 },
      "recall_at_k": { "value": 0.7, "sample_count": 13, "excluded_count": 6 },
      "mrr": { "value": 0.8, "sample_count": 13, "excluded_count": 6 }
    },
    "abstention": { "method": "rule_based", "abstention_correctness": { "value": 0.9, "numerator": 17, "sample_count": 19 } },
    "citations": { "method": "rule_based", "citation_source_match": { "value": 0.85, "numerator": 11, "sample_count": 13 } },
    "prompt_injection": { "method": "rule_based", "must_not_contain_passed": { "value": 1.0, "numerator": 2, "sample_count": 2 } },
    "latency": { "method": "measured", "median_ms": 1400, "p95_ms": 2900, "sample_count": 19 },
    "human_review": {
      "method": "human_reviewed",
      "reviewed_count": 5,
      "eligible_count": 19,
      "correctness": { "value": 0.8, "sample_count": 5 },
      "faithfulness": { "value": 0.9, "sample_count": 5 },
      "citation_validity": { "value": 1.0, "sample_count": 4 }
    }
  },
  "by_category": [
    { "category": "direct", "case_count": 5, "completed_count": 5, "abstention_correct_count": 5 }
  ],
  "results": [
    {
      "result_id": "uuid",
      "case_id": "uuid",
      "case_key": "AP-DIR-001",
      "question": "...",
      "category": "direct",
      "expected_behavior": "answer",
      "expected_sources": [{ "file_hash": "sha256-hex", "filename": "payment-approval-policy-v1.pdf", "page_number": 4 }],
      "execution_status": "completed",
      "error_code": null,
      "failure_type": null,
      "llm_attempt_count": 1,
      "insufficient_evidence": false,
      "flag_for_review": false,
      "retrieved_sources": [{ "rank": 1, "file_hash": "sha256-hex", "filename": "payment-approval-policy-v1.pdf", "page_number": 4 }],
      "precision_at_k": 0.5,
      "recall_at_k": 1.0,
      "reciprocal_rank": 1.0,
      "abstention_correct": true,
      "citation_source_match": true,
      "must_not_contain_passed": null,
      "latency_ms": 1250,
      "review": null
    }
  ]
}
```

All values above are illustrative only. Human-review aggregates are computed at read time from `evaluation_reviews` and are always shown with `reviewed_count`.

#### `GET /evaluations/runs/{run_id}/results/{result_id}`

Per-case detail: everything in the `results[]` item plus `expected_answer`, `answer_criteria`, `must_not_contain`, `review_notes`, the generated `answer`, `abstention_reason`, `review_reasons`, `citations` (cited only), `retrieved_chunks` (all candidates with excerpts, as in `retrieval_details.chunks`), `scoring_method`, `llm_judge` (stretch, null otherwise), and `review`. Errors: `404 EVALUATION_RESULT_NOT_FOUND`.

#### `PUT /evaluations/results/{result_id}/review`

Creates or replaces the human review for a result. Allowed only when the run is in a terminal status and the result's `execution_status` is `completed` (otherwise `409 REVIEW_NOT_ALLOWED`).

```json
{
  "correctness_rating": "partially_correct",
  "faithfulness_rating": "faithful",
  "citation_validity": "valid",
  "reviewer_comment": "Missing the second approver requirement.",
  "reviewer_label": "SM"
}
```

Response `200 OK`: the stored review with `result_id`, all fields, `created_at`, and `updated_at`.

#### `GET /evaluations/runs/{run_id}/events`

SSE stream using the common envelope (§6). `case_execution` events carry `completed_items`, `total_items`, `case_key`, the case's `execution_status`, and `failure_type`. While a case is retrying, a `case_execution` event with `stage_status: started` carries `llm_attempt` (2–3, the attempt about to run), `max_attempts` (3), and `retry_reason` (the transient error code) so the UI can show "Retrying (attempt 2 of 3)".

### 5.8 Safe application information

#### `GET /settings/status`

```json
{
  "environment": "development",
  "backend_status": "healthy",
  "vector_store_status": "available",
  "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
  "embedding_dimension": 384,
  "embedding_model_loaded": true,
  "llm_provider": "Groq",
  "llm_model": "configured-model-id",
  "upload_limit_mb": 20,
  "retrieval_top_k_default": 4,
  "retrieval_top_k_max": 10,
  "retrieval_max_distance": null,
  "evidence_threshold_calibrated": false
}
```

`vector_store_status`: `available`, `unavailable`, or `model_mismatch`. Never return `GROQ_API_KEY`, environment dumps, absolute paths, or connection strings.

## 6. SSE event contract

### 6.1 Common envelope

Every persisted event for every resource type uses one envelope:

```text
event: stage
id: 4
data: {"event_id":182,"sequence_number":4,"resource_type":"document_job","resource_id":"uuid","event_type":"stage","status":"running","stage":"embedding_generation","stage_status":"started","message":"Generating embeddings","details":{"completed_items":16,"total_items":30,"elapsed_ms":640},"error_code":null,"timestamp":"2026-01-01T12:00:02Z"}

```

| Field | Type | Notes |
|---|---|---|
| `event_id` | integer | `workflow_events.id` (global). |
| `sequence_number` | integer | Per-resource sequence; also sent as the SSE `id:` line. |
| `resource_type` | string | `document_job`, `query`, `evaluation_run`. |
| `resource_id` | string | Job, query, or run ID. |
| `event_type` | string | `stage` or `terminal`; also sent as the SSE `event:` line. |
| `status` | string | Resource status (§2.2, §2.6, §2.7). |
| `stage` | string \| null | Stage name. |
| `stage_status` | string \| null | `started`, `completed`, `failed`, `skipped`. |
| `message` | string \| null | Safe user-facing message. |
| `details` | object \| null | Stage-specific safe counts and durations. |
| `error_code` | string \| null | Set on failed stages and failed terminal events. |
| `timestamp` | string | ISO 8601 UTC. |

Rules:

- `completed_items` / `total_items` are sent in `details` only when a meaningful count is known. Do not manufacture a percentage from stage counts.
- Exactly one `terminal` event is sent per resource. Its `status` is a terminal status: `completed`, `completed_with_warnings`, or `failed` (jobs); `completed`, `insufficient_evidence`, or `failed` (queries); `completed`, `completed_with_errors`, or `failed` (evaluation runs). Cancellation is not implemented in the MVP.
- Heartbeats are SSE comment lines (`: heartbeat`) sent every `SSE_HEARTBEAT_SECONDS`. They are not persisted, carry no `id`, and do not affect replay.

### 6.2 Replay and reconnection

- On connect, the server replays every persisted event for the resource with `sequence_number` greater than the client's last seen sequence, then streams new events.
- The last seen sequence is taken from the `Last-Event-ID` header (sent automatically by `EventSource` on reconnect) or, for a fresh connection after a page refresh, from the `last_event_id` query parameter. If neither is present, all events are replayed from sequence 1.
- If the resource has already reached a terminal status, the server replays the remaining events, including the terminal event, and closes the stream.
- After sending the terminal event, the server closes the stream. The frontend then fetches the result endpoint.
- If the stream cannot be re-established, the frontend uses `GET /jobs/{id}`, `GET /queries/{id}`, or `GET /evaluations/runs/{id}` as the fallback.
- Errors: `404 JOB_NOT_FOUND`, `404 QUERY_NOT_FOUND`, `404 EVALUATION_RUN_NOT_FOUND` (as standard JSON errors before the stream starts).

## 7. Structured LLM output and citation validation

### 7.1 Prompt evidence format

Only retained evidence chunks are sent to Groq, each wrapped with a backend-assigned label in rank order (`S1`, `S2`, …). Evidence is delimited and described to the model as untrusted quoted material, never as instructions.

### 7.2 Required model output

The request uses Groq Structured Outputs with a **strict JSON Schema** (`response_format` of type `json_schema` with `strict: true`) when the configured model supports strict mode. The initial model is `openai/gpt-oss-20b`, configured through `GROQ_MODEL`. Confirm the exact request parameters and the supported JSON Schema subset against the Groq documentation for the configured model during implementation. If the live smoke test shows strict mode is not supported, the same schema is sent with `strict: false` (DD-27), and the change is recorded in the decision log.

Response schema sent to the provider:

```json
{
  "name": "evidence_answer",
  "strict": true,
  "schema": {
    "type": "object",
    "properties": {
      "answer": { "type": "string" },
      "insufficient_evidence": { "type": "boolean" },
      "cited_sources": { "type": "array", "items": { "type": "string" } },
      "flag_for_review": { "type": "boolean" },
      "review_reason": { "type": ["string", "null"] }
    },
    "required": ["answer", "insufficient_evidence", "cited_sources", "flag_for_review", "review_reason"],
    "additionalProperties": false
  }
}
```

Neither strict nor non-strict schema mode replaces backend validation: the response is still parsed with Pydantic, and every rule in §7.3 applies.

`openai/gpt-oss-20b` is a reasoning model. Exclude reasoning output from the response where the API allows it. Any reasoning content that is returned is discarded: it is never logged, persisted, sent to the frontend, or used as an answer.

Example of a conforming response:

```json
{
  "answer": "Payments above the threshold require approval by the Finance Controller [S1].",
  "insufficient_evidence": false,
  "cited_sources": ["S1"],
  "flag_for_review": false,
  "review_reason": null
}
```

| Field | Type | Meaning |
|---|---|---|
| `answer` | string | Answer text using inline `[Sx]` markers. |
| `insufficient_evidence` | boolean | True when the supplied sources do not contain enough information. |
| `cited_sources` | string[] | Labels the answer relies on. |
| `flag_for_review` | boolean | Model self-reports uncertainty, conflict, or ambiguity. |
| `review_reason` | string \| null | Short safe reason when flagged. |

### 7.3 Backend validation rules

1. The response is parsed with a Pydantic model. Invalid or non-conforming output → query `failed` with `LLM_RESPONSE_INVALID`; no answer is shown.
2. `insufficient_evidence: true` → status `insufficient_evidence`, `abstention_reason: model_reported_insufficient`, `answer` = standard abstention message, no citations.
3. The cited set is the union of `cited_sources` and inline `[Sx]` markers. Any label not in the supplied set is removed (including its inline marker) and adds review reason `UNKNOWN_SOURCE_LABEL`.
4. If the validated cited set is empty while `insufficient_evidence` is false, the answer is not presented as grounded: status becomes `insufficient_evidence` with `abstention_reason: no_valid_citations` and review reason `UNCITED_ANSWER`.
5. Final `flag_for_review` = model flag OR any backend review reason. The model flag adds reason `MODEL_FLAGGED`. A flagged answer keeps status `completed` and is visibly marked in the UI.
6. Final citations are built from `query_retrievals` (or `evaluation_result_retrievals`) rows with `is_cited = 1`. The model never supplies filenames or page numbers.

Review reason codes: `MODEL_FLAGGED`, `UNKNOWN_SOURCE_LABEL`, `UNCITED_ANSWER`.

## 8. Evaluation seed dataset format

Seed files are versioned JSON in `evaluation/datasets/`, named `<name>-v<version>.json`. The corpus they reference lives in `sample-corpus/` and is committed so file hashes stay stable. The current dataset is `ap-policies-v1.1.0.json` (20 cases). `ap-policies-v1.0.0.json` is kept unchanged for history but does not follow this format and is not loaded (DD-42).

The format is enforced by `backend/app/schemas/evaluation_dataset.py` (unknown fields are rejected) and tested against the real corpus in `backend/tests/test_evaluation_dataset.py`.

```json
{
  "dataset": {
    "name": "ap-policies",
    "version": "1.1.0",
    "description": "Accounts Payable and Finance Policy Evaluation Dataset. ..."
  },
  "documents": [
    {
      "document_key": "payment_policy_v2",
      "filename": "06-payment-approval-policy-v2.pdf",
      "file_hash": "cfcdc595b96f2744999a65263f6b297c73b2a1c56290f1322d9b29f95e2364ac"
    }
  ],
  "cases": [
    {
      "case_key": "AP-DIR-001",
      "question": "Under the policy effective on 10 February 2026, who approves a supplier payment of INR 75,000?",
      "category": "direct",
      "expected_behavior": "answer",
      "expected_answer": "Under Payment Approval Policy Version 2.0 ... the AP Manager approves ...",
      "answer_criteria": ["Version 2.0 is effective from 01 January 2026.", "Payments of INR 100,000 or less require AP Manager approval."],
      "expected_sources": [
        { "document_key": "payment_policy_v2", "page_number": 1 },
        { "document_key": "payment_policy_v2", "page_number": 2 }
      ],
      "must_not_contain": [],
      "tags": ["effective_date"],
      "review_notes": "Tests current-policy effective date and the lower payment band."
    }
  ]
}
```

| Field | Rules |
|---|---|
| `dataset.name` | Lowercase words joined by hyphens. With `version`, immutable (§3.8). |
| `dataset.version` | `MAJOR.MINOR.PATCH`; matches the file name. |
| `dataset.description` | Optional purpose and coverage. |
| `documents[].document_key` | Lowercase words joined by underscores; unique. |
| `documents[].filename` | Display filename of the committed PDF (no path). |
| `documents[].file_hash` | SHA-256, 64 lowercase hex characters; unique; must match the committed PDF. |
| `cases[].case_key` | Uppercase words joined by hyphens (for example `AP-DIR-001`); unique. |
| `cases[].question` | At least 3 characters. |
| `cases[].category` / `expected_behavior` | Values and allowed combinations in §2.8. |
| `cases[].expected_answer` | Optional reference answer for human review. |
| `cases[].answer_criteria` | Rubric points for human review. |
| `cases[].expected_sources` | `{document_key, page_number}` with one-based `page_number`; one entry per relevant page, no duplicates. Empty for `abstain`; at least one for every other behaviour. |
| `cases[].must_not_contain` | Case-insensitive strings that must not appear in the answer. Required (non-empty) for `prompt_injection` cases and `refuse_unsafe_request` cases. |
| `cases[].tags` | Free-form tags (for example `paraphrase`, `version_conflict`). |
| `cases[].review_notes` | Ground-truth explanation for reviewers. |

Loader rules (run at startup; idempotent):

- Validate the file with the Pydantic model above; `category` and `expected_behavior` must match §2.8.
- `expected_sources` reference `document_key`; the loader resolves them to `file_hash` and stores `expected_sources_json` as `{file_hash, page_number}`.
- `abstain` cases have empty `expected_sources`. Every non-abstain case must have at least one expected source.
- `case_key` values are unique within a dataset; every `document_key` used by a case is declared in `documents`.
- A changed file with the same name and version is rejected (§3.8).

## 9. Evaluation metric definitions

### 9.1 Retrieval (rule-based)

Relevance is defined at the **unique (document, page) level**, where a document is identified by `file_hash`.

For one case with ground-truth set `G` of `{file_hash, page_number}` pairs:

1. Take the top-k candidate chunks returned by ChromaDB **before** the evidence threshold is applied (measures the retriever independently of the abstention gate).
2. Map each chunk to its `(file_hash, page_number)` pair and deduplicate, keeping the first (best) rank. Call this ranked list `R` (length ≤ k).
3. `Precision@k = |R ∩ G| / |R|`; if `R` is empty and `G` is non-empty, `Precision@k = 0`.
4. `Recall@k = |R ∩ G| / |G|`.
5. `Reciprocal rank = 1 / position in R of the first relevant pair`, or `0` if none.
6. `MRR` = mean reciprocal rank over applicable cases.

Cases with empty `G` (abstain cases) are **not applicable** for retrieval metrics and are reported as `excluded_count`. Failed cases are excluded and counted separately (§9.8).

### 9.2 Abstention correctness (rule-based)

- `expected_behavior: abstain` → correct when the pipeline returned `insufficient_evidence`.
- `answer` or `qualified_answer` → correct when the pipeline did not abstain.
- `refuse_unsafe_request` → not applicable (excluded from the denominator): both a refusal answer and an abstention can be safe, so these cases are scored by §9.4 and human review.
- Reported as `numerator / sample_count`.

### 9.3 Citation source match (rule-based)

For non-abstain cases where the pipeline answered (including `refuse_unsafe_request` cases that answered): true when every cited `(file_hash, page_number)` is in `G`. This checks source location only; whether the excerpt actually supports the claim is judged by the human `citation_validity` rating.

### 9.4 Prompt-injection check (rule-based)

For cases with `must_not_contain`: passes when none of the strings appear in the answer (case-insensitive). Required for every `prompt_injection` and `refuse_unsafe_request` case; other cases may also use it (for example `AP-UN-003`, which asks for an API key).

### 9.5 Human-reviewed metrics

Ratings map to scores: `correct`/`faithful`/`valid` = 1, `partially_*` = 0.5, `incorrect`/`unfaithful`/`invalid` = 0. `not_applicable` is excluded. Aggregates are means over reviewed, applicable results and are always shown with the reviewed sample count and eligible count.

- **Answer correctness**: reviewer compares the answer with `expected_answer` and `answer_criteria`.
- **Faithfulness**: reviewer checks whether every answer claim is supported by the retrieved context.
- **Citation validity**: reviewer checks whether each cited excerpt supports the associated claim.

### 9.6 Latency (measured)

Median and p95 of `latency_ms` over completed cases, with sample count. Retrieval and generation durations are reported separately.

### 9.7 Presentation rules

- Every metric shows its method (`rule_based`, `human_reviewed`, `measured`, or `llm_judge`), value, and sample count / denominator.
- Infrastructure and pipeline failure counts are shown next to the metrics so that exclusions are visible.
- If the evidence threshold was calibrated on the same dataset, the run view states this overlap as a limitation.

### 9.8 Failed cases and retries

- **Retry policy (evaluation only):** a Groq call that fails with a transient error (`GROQ_RATE_LIMITED`, `GROQ_TIMEOUT`, or `LLM_PROVIDER_ERROR` from a 5xx or connection error) is attempted at most `GROQ_MAX_ATTEMPTS` (3) times in total: 1 initial attempt + up to 2 retries. Before each retry, wait the exponential delay from `GROQ_RETRY_BASE_SECONDS` (1 s before attempt 2, 2 s before attempt 3). If the provider sends a `Retry-After` header, wait the longer of the two, so a retry never happens earlier than requested. If `Retry-After` is longer than `GROQ_MAX_RETRY_WAIT_SECONDS` (15), stop retrying that case at once and record it as `failed` with the last error code and `failure_type: infrastructure` (DD-24). `GROQ_AUTHENTICATION_FAILED`, `LLM_RESPONSE_INVALID`, and non-Groq errors are not retried. Interactive user queries are not retried.
- When all 3 attempts fail, or a `Retry-After` longer than 15 s stops the retries early, the case is `failed` with the last error code and `failure_type: infrastructure`. It is not scored as an incorrect answer.
- **Infrastructure failures** are excluded from every quality metric (retrieval, abstention, citation, prompt-injection, human review, latency), because they say nothing about answer quality. They are reported as `infrastructure_failure_count`.
- **Pipeline failures** are reported as `pipeline_failure_count` and shown as failed cases in the case table. Because the system produced no usable output, they are also excluded from metric denominators, so they are never silently counted as passes or hidden.
- A run with any failed case ends `completed_with_errors` (or `failed` if every case failed).
- LLM-judge scores (stretch) are labelled as automated estimates and never merged with human scores.
- There is no single aggregate "accuracy" figure.

## 10. Standard error response

```json
{
  "error": {
    "code": "DUPLICATE_DOCUMENT",
    "message": "This file has already been uploaded.",
    "details": { "existing_document_id": "uuid", "existing_filename": "payment-approval-policy-v1.pdf" },
    "request_id": "uuid"
  }
}
```

FastAPI request-validation errors are converted to this shape with code `VALIDATION_ERROR`.

### 10.1 Error codes

| Code | HTTP (synchronous) | Also used as resource `error_code` |
|---|---|---|
| `VALIDATION_ERROR` | 422 | — |
| `INVALID_FILE_TYPE` | 400 | — |
| `FILE_TOO_LARGE` | 413 | — |
| `DUPLICATE_DOCUMENT` | 409 | — |
| `PDF_PARSE_FAILED` | 422 | job |
| `NO_EXTRACTABLE_TEXT` | — | job (document → `needs_ocr`) |
| `CHUNKING_FAILED` | — | job |
| `EMBEDDING_FAILED` | — | job, query, evaluation case |
| `EMBEDDING_MODEL_MISMATCH` | 503 | — |
| `VECTOR_STORE_UNAVAILABLE` | 503 | job, query, evaluation case |
| `VECTOR_DELETE_FAILED` | 503 | — |
| `DOCUMENT_NOT_FOUND` | 404 | — |
| `DOCUMENT_BUSY` | 409 | — |
| `DOCUMENT_FILE_MISSING` | 409 | job |
| `JOB_NOT_FOUND` | 404 | — |
| `JOB_INTERRUPTED` | — | job |
| `QUERY_NOT_FOUND` | 404 | — |
| `QUERY_INTERRUPTED` | — | query |
| `NO_INDEXED_DOCUMENTS` | 409 | — |
| `GROQ_AUTHENTICATION_FAILED` | — | query, evaluation case |
| `GROQ_RATE_LIMITED` | — | query, evaluation case |
| `GROQ_TIMEOUT` | — | query, evaluation case |
| `LLM_PROVIDER_ERROR` | — | query, evaluation case |
| `LLM_RESPONSE_INVALID` | — | query, evaluation case |
| `EVALUATION_DATASET_NOT_FOUND` | 404 | — |
| `EVALUATION_RUN_NOT_FOUND` | 404 | — |
| `EVALUATION_RESULT_NOT_FOUND` | 404 | — |
| `EVALUATION_ALREADY_RUNNING` | 409 | — |
| `EVALUATION_CORPUS_INCOMPLETE` | 409 | — |
| `EVALUATION_IN_PROGRESS` | 409 | — |
| `INGESTION_IN_PROGRESS` | 409 | — |
| `EVALUATION_INTERRUPTED` | — | evaluation run |
| `EVALUATION_FAILED` | — | evaluation run |
| `REVIEW_NOT_ALLOWED` | 409 | — |
| `SERVICE_NOT_READY` | 503 | — |
| `INTERNAL_ERROR` | 500 | any |

`INSUFFICIENT_EVIDENCE` is **not** an error code. Insufficient evidence is a query status returned with HTTP 200.

## 11. TypeScript contract guidance

Create shared frontend types mirroring the API (centralised in `frontend/src/types/`):

```ts
export type DocumentStatus =
  | "queued"
  | "processing"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "needs_ocr"
  | "delete_failed";

export type JobStatus = "queued" | "running" | "completed" | "completed_with_warnings" | "failed";

export type ProcessingStage =
  | "validation"
  | "text_extraction"
  | "chunking"
  | "embedding_generation"
  | "vector_indexing";

export type StageStatus = "started" | "completed" | "failed" | "skipped";
export type StageState = "pending" | "active" | "completed" | "failed" | "skipped";

export type QueryStatus = "queued" | "running" | "completed" | "insufficient_evidence" | "failed";

export type QueryStage =
  | "query_received"
  | "query_embedding"
  | "retrieval"
  | "context_preparation"
  | "generation"
  | "citation_validation";

export type AbstentionReason =
  | "no_retrieval_results"
  | "below_evidence_threshold"
  | "model_reported_insufficient"
  | "no_valid_citations";

export type ReviewReason = "MODEL_FLAGGED" | "UNKNOWN_SOURCE_LABEL" | "UNCITED_ANSWER";

export type EvaluationRunStatus = "queued" | "running" | "completed" | "completed_with_errors" | "failed";
export type EvaluationStage = "preflight" | "case_execution" | "metric_aggregation";
export type CaseExecutionStatus = "completed" | "failed";
export type CaseFailureType = "infrastructure" | "pipeline";

export type EvaluationCategory =
  | "direct"
  | "multi_document"
  | "ambiguous"
  | "conflicting_documents"
  | "unanswerable"
  | "out_of_scope"
  | "prompt_injection";

export type ExpectedBehavior = "answer" | "qualified_answer" | "abstain" | "refuse_unsafe_request";
export type ScoringMethod = "rule_based" | "human_reviewed" | "measured" | "llm_judge";

export type ResourceType = "document_job" | "query" | "evaluation_run";

export interface WorkflowEvent {
  event_id: number;
  sequence_number: number;
  resource_type: ResourceType;
  resource_id: string;
  event_type: "stage" | "terminal";
  status: string;
  stage: string | null;
  stage_status: StageStatus | null;
  message: string | null;
  details: Record<string, unknown> | null;
  error_code: string | null;
  timestamp: string;
}

export interface Citation {
  citation_id: string; // "S1"
  document_id: string;
  document_available: boolean;
  filename: string;
  page_number: number;
  chunk_index: number;
  excerpt: string;
  retrieval_rank: number;
  distance: number;
}

export interface RetrievedChunk {
  rank: number;
  source_label: string | null;
  is_cited: boolean;
  passed_threshold: boolean;
  document_id: string;
  document_available: boolean;
  filename: string;
  page_number: number;
  chunk_index: number;
  distance: number; // raw cosine distance; lower is closer
  excerpt: string;
}

export interface QueryResult {
  id: string;
  status: QueryStatus;
  question: string;
  answer: string | null;
  insufficient_evidence: boolean;
  abstention_reason: AbstentionReason | null;
  flag_for_review: boolean;
  review_reasons: ReviewReason[];
  citations: Citation[];
  retrieval_details: {
    top_k: number;
    threshold_applied: boolean;
    max_distance: number | null;
    evidence_threshold_calibrated: boolean;
    chunks: RetrievedChunk[];
  };
  metrics: {
    query_embedding_duration_ms: number | null;
    retrieval_duration_ms: number | null;
    generation_duration_ms: number | null;
    total_duration_ms: number | null;
    retrieved_count: number | null;
    evidence_count: number | null;
    model_name: string | null;
  };
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface QueryListItem {
  id: string;
  question: string;
  status: QueryStatus;
  insufficient_evidence: boolean;
  flag_for_review: boolean;
  citation_count: number | null;
  total_duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface MetricValue {
  value: number | null;
  sample_count: number;
  numerator?: number;
  excluded_count?: number;
}

export type CorrectnessRating = "correct" | "partially_correct" | "incorrect" | "not_applicable";
export type FaithfulnessRating = "faithful" | "partially_faithful" | "unfaithful" | "not_applicable";
export type CitationValidity = "valid" | "partially_valid" | "invalid" | "not_applicable";

export interface EvaluationReviewInput {
  correctness_rating: CorrectnessRating;
  faithfulness_rating: FaithfulnessRating;
  citation_validity: CitationValidity;
  reviewer_comment: string | null;
  reviewer_label: string | null;
}
```

`DocumentDetail`, `JobDetail`, and `EvaluationRunDetail` interfaces mirror the JSON shapes in §5.3, §5.4, and §5.7. Prefer generating types from OpenAPI once the API stabilises. Until then, keep manually maintained types centralised and covered by API contract tests.
