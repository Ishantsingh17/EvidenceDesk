# Decision Log

## AI-Powered Enterprise Document Retrieval & Evidence Assistant

| Field | Value |
|---|---|
| Document type | Architecture and product decision log |
| Version | 1.4 |
| Status | Active |

This log records approved decisions that change or clarify the baseline documents. When a decision here conflicts with older wording elsewhere, this log and `docs/04-BACKEND-SCHEMA.md` take precedence, and the conflicting document must be corrected.

Status labels:

| Label | Meaning |
|---|---|
| **Approved** | Approved by the product owner. Binding for implementation. |
| **Awaiting approval** | Proposed detail needed to apply an approved decision. Documented and assumed in the other docs, but the product owner has not yet confirmed it. |
| **Superseded** | Replaced by a later decision. Kept for history only; do not implement. |
| **Implementation-time calibration** | The rule is approved, but a value must be measured or confirmed during implementation and then recorded in §4. |

---

## 1. Approved decisions (2026-11-16)

These came from the documentation consistency audit and were approved by the product owner on 2026-11-16.

| ID | Decision | Rationale | Affected documents |
|---|---|---|---|
| D-01 | Document status, processing-job status, and processing stage are separate fields with separate value sets. Statuses add `completed_with_warnings`; `completed` is a status, never a stage. | The earlier docs mixed stage names, document statuses, and job statuses in one list. | Schema §2–3, TRD §7, App Flow §3/§8, UI §4.2/§5 |
| D-02 | Insufficient evidence is a normal HTTP 200 result (`status: insufficient_evidence`), not an API error. `INSUFFICIENT_EVIDENCE` is removed from error codes. | Abstention is a correct, expected outcome and is evaluated as such. | PRD FR-12, Schema §2.6/§5.5/§10, TRD §8/§14, App Flow §5 |
| D-03 | One common SSE event envelope (`event_id`, `sequence_number`, `resource_type`, `resource_id`, `event_type`, `status`, `stage`, `stage_status`, `message`, `details`, `error_code`, `timestamp`) for jobs, queries, and evaluation runs, with `Last-Event-ID` replay. | Three inconsistent event shapes existed; replay prevents lost events and races. | Schema §6, TRD §11, App Flow |
| D-04 | All backend data paths are resolved from the project root. Frontend adds `VITE_API_MODE=mock\|live`. | `./data` relative to `backend/` conflicted with the repo layout; the mock adapter needed an explicit switch. | TRD §5/§12/§17, CLAUDE.md, README |
| D-05 | Evaluation categories: `direct`, `multi_document`, `ambiguous`, `conflicting_documents`, `unanswerable`, `out_of_scope`, `prompt_injection`. | Three different category lists existed. | Schema §2.8, PRD §11, TRD §10, App Flow §6, Plan |
| D-06 | Add `GET /api/v1/queries` for query history. | Query history was a Must-have with no endpoint. | Schema §5.5, PRD FR-21, UI Screen 3 |
| D-07 | Evaluation ground truth uses stable SHA-256 file hashes and a versioned JSON seed dataset. Retrieval relevance is defined at the unique (document, page) level. | Random document UUIDs broke ground truth on every reset; chunk-level relevance was ambiguous. | Schema §3.8–3.10/§8/§9, TRD §10, PRD §11 |
| D-08 | In-app human review with correctness rating, faithfulness rating, citation validity, and reviewer comments. | Manual review was required but had no mechanism. | Schema §3.14/§5.7/§9.5, PRD FR-24, UI Screen 4, App Flow §6 |
| D-09 | Evaluation schema adds per-case execution status, errors, retrieved excerpts, and run status `completed_with_errors`. Evaluation runs do not write user query records and do not affect dashboard query statistics. | Failed cases and incomplete runs could not be represented; evaluation would have distorted dashboard metrics. | Schema §2.7/§3.11–3.13/§5.2, TRD §10, App Flow §6 |
| D-10 | Add a `document_pages` table with page-level extraction statistics and warnings; support `completed_with_warnings`. | Page diagnostics and low-text warnings had no storage. | Schema §3.2, TRD §7, PRD FR-03, UI Screen 2 |
| D-11 | The LLM returns structured output with `insufficient_evidence` and `flag_for_review` fields; the backend validates cited labels against actually retrieved sources. | Abstention and citation use must be machine-checkable before the threshold is calibrated. | Schema §7, TRD §8, App Flow §4–5 |
| D-12 | Final citations include only cited, validated source labels. All retrieved chunks are shown separately as retrieval details. | Citation scope was undefined. | Schema §5.5/§7.3, PRD FR-11, UI Screen 3 |
| D-13 | Add response schemas for `GET /documents/{id}`, `GET /jobs/{id}`, `GET /evaluations/runs/{id}`, and `POST /documents/{id}/reprocess`. Retry/reprocess always creates a new processing job. | These responses were undefined; retry had no endpoint. | Schema §5.3/§5.4/§5.7, PRD FR-22 |
| D-14 | Duplicate files are rejected by SHA-256 with HTTP 409. Multiple files are independent uploads and jobs. File validation is performed before background processing. | Duplicate policy and multi-file behaviour were undecided. | Schema §5.3, TRD §7.1, PRD FR-01/FR-02, App Flow §3 |
| D-15 | Hard deletion of uploaded files and associated vectors; historical query/evaluation snapshots are preserved. Deletion is not allowed while a document is processing. | Deletion edge cases were undefined. | Schema §3.15/§5.3, TRD §7.3, PRD FR-23 |
| D-16 | Store embedding model and dimension metadata with the ChromaDB collection; prevent mixing embeddings from different models. | Changing `EMBEDDING_MODEL` would silently corrupt retrieval. | Schema §4.1, TRD §6.4 |
| D-17 | Single Uvicorn worker; CPU-heavy embedding work outside the event loop; embedding model loaded once at startup; SQLite WAL mode; interrupted jobs recovered at startup. | Chroma persistent client and the in-process event bus require one process; blocking work would stall SSE. | TRD §6.3, PRD §12 |
| D-18 | Each question is independent. No conversation memory in the MVP. | Keeps grounding and evaluation unambiguous. | PRD UC-02/§8, TRD §2/§8, UI Screen 3 |
| D-19 | Dark mode, document comparison, and advanced features remain stretch goals. | Protects MVP delivery. | PRD §8, TRD §5.2, UI §3.1/§4.1/§5, Plan §11 |
| D-20 | The labelled dataset, including prompt-injection, ambiguous, unanswerable, and conflicting-document cases, is created during early project setup (Phase 0). | Threshold calibration (Phase 6) needs labelled questions before the evaluation phase. | Plan §3, TRD §10.1 |

## 2. Derived decisions

These details were needed to apply the approved decisions consistently. They do not change the architecture or add technologies. DD-01 to DD-22 (except the superseded DD-16) were approved by the product owner on 2026-11-16; DD-02 and DD-18 were approved with the refinements shown.

| ID | Status | Decision | Applies | Reason |
|---|---|---|---|---|
| DD-01 | Approved | `POST /documents/upload` accepts exactly one file per request; the frontend sends one request per file. | D-14 | The simplest way to make each file's HTTP result (202/409/413…) independent. |
| DD-02 | Approved | One document-processing job at a time (single-thread executor) and one evaluation run at a time (`409 EVALUATION_ALREADY_RUNNING`); cases run sequentially. **Ingestion and evaluation never run at the same time:** starting an evaluation while any job is `queued` or `processing` returns `409 INGESTION_IN_PROGRESS`, and upload, reprocess, and delete return `409 EVALUATION_IN_PROGRESS` while a run is `queued` or `running`. `GET /health` exposes `activity` so the UI can disable these controls with a reason. Python standard-library concurrency only. *(Refined 2026-11-16; blocking deletion during a run approved by the product owner on 2026-11-16.)* | D-17 | Predictable CPU use and Chroma writes; fewer Groq rate limits; the indexed corpus cannot change in the middle of an evaluation run. |
| DD-03 | Approved | Startup recovery marks interrupted jobs/queries/runs as `failed` (`JOB_INTERRUPTED`, `QUERY_INTERRUPTED`, `EVALUATION_INTERRUPTED`), removes partial vectors, and writes a terminal event. Interrupted work is not restarted automatically. | D-17 | Truthful state without surprise background work. |
| DD-04 | Approved | `validation` stays a stage, but runs synchronously and is persisted as the job's first completed event. | D-01, D-14 | The timeline can show validation truthfully even though it happens before queuing. |
| DD-05 | Approved | An answer with no valid citations is converted to `insufficient_evidence` (`no_valid_citations`) and flagged for review. | D-11, D-12 | Prevents an uncited answer being presented as grounded. |
| DD-06 | Approved | Abstention reasons: `no_retrieval_results`, `below_evidence_threshold`, `model_reported_insufficient`, `no_valid_citations`. Review reasons: `MODEL_FLAGGED`, `UNKNOWN_SOURCE_LABEL`, `UNCITED_ANSWER`. | D-02, D-11 | Makes abstention explainable and testable. |
| DD-07 | Approved | Heartbeats are SSE comment lines, are not persisted, and carry no ID. | D-03 | Keepalive without disturbing replay sequence numbers. |
| DD-08 | Approved | Fresh connections (after a page refresh) pass the last seen sequence as the `last_event_id` query parameter, because `EventSource` cannot set headers. | D-03 | Replay works on both automatic reconnect and refresh. |
| DD-09 | Approved | Document status `delete_failed` is used when vectors are removed but the file cannot be deleted; delete can be retried. | D-15 | Reports partial deletion honestly. |
| DD-10 | Approved | Reprocess is allowed from `completed`, `completed_with_warnings`, `failed`, and `needs_ocr`; it removes existing vectors and page rows before re-indexing. | D-13 | Supports retrying after failures and after configuration changes. |
| DD-11 | Approved | Retrieval metrics are computed on the top-k candidates **before** the evidence threshold, after deduplicating to unique (file_hash, page). Precision@k uses the deduplicated list length as denominator; empty retrieval with non-empty ground truth scores 0. | D-07 | Measures the retriever independently of the abstention gate. |
| DD-12 | Approved | Human rating scale: full = 1, partial = 0.5, none = 0, `not_applicable` excluded; aggregates shown with reviewed and eligible counts and computed at read time. | D-08 | Documented, reproducible scoring. |
| DD-13 | Approved | Rule-based checks added: `citation_source_match` (cited locations ⊆ expected) and `must_not_contain_passed` for prompt-injection cases. | D-05, D-09 | Gives `prompt_injection` cases a measurable outcome. |
| DD-14 | Approved | Seed `(name, version)` pairs are immutable; a changed seed file requires a new version. Expected sources reference `document_key`, resolved to `file_hash`. | D-07 | Keeps runs comparable across time. |
| DD-15 | Approved | The synthetic corpus (`sample-corpus/`) and seed datasets (`evaluation/datasets/`) are **committed** to Git. Uploaded runtime files (`data/uploads/`) are never committed. | D-07 | Stable SHA-256 hashes require fixed, versioned corpus files. |
| DD-16 | Superseded | *Superseded by D-23 and DD-27.* Structured output uses Groq Structured Outputs with a strict JSON Schema (schema §7.2). Invalid output fails the query with `LLM_RESPONSE_INVALID`. | D-11 | Uses an existing Groq feature; no new dependency. |
| DD-17 | Approved | Queries only retrieve from documents with status `completed` or `completed_with_warnings`. | D-01 | Prevents retrieving partially indexed documents. |
| DD-18 | Approved | Evaluation preflight rejects a run with `409 EVALUATION_CORPUS_INCOMPLETE` only when a document referenced by **the selected dataset** is missing or not fully indexed (`completed` or `completed_with_warnings`). Other indexed documents that the dataset does not reference do not block the run. *(Refined 2026-11-16.)* | D-07 | Prevents misleading metrics from a partial corpus without blocking evaluation because of unrelated uploads. |
| DD-19 | Approved (value: Implementation-time calibration) | `MIN_PAGE_TEXT_CHARS` (provisional default 30) defines a low-text page. | D-10 | Needed to classify page warnings; to be verified on the corpus. |
| DD-20 | Approved | Cancellation of processing jobs is not implemented in the MVP and no cancel control is shown. | D-01, D-19 | Avoids a dead control. |
| DD-21 | Approved | Added `GET /evaluations/runs/{run_id}/results/{result_id}` for per-case detail with excerpts. | D-09 | Keeps the run response small while supporting the detail view. |
| DD-22 | Approved | Feedback (FR-20) and evaluation run history remain **Should**; comparison, dark theme, document-type filter, export, and LLM-judge/RAGAS are **Stretch**. | D-19 | Separates "should" from "after MVP". |

## 3. Approved decisions on former open items (2026-11-16)

These resolve open items OI-01 to OI-08 and were approved by the product owner on 2026-11-16.

| ID | Former item | Decision | Affected documents |
|---|---|---|---|
| D-21 | OI-01 Repository location | Move the project **outside OneDrive** before Phase 1. The developer does the move; it is not automated. | Plan §3 |
| D-22 | OI-02 Python version | **Superseded by D-29 (2026-11-17).** *Originally: use Python 3.12 for the backend virtual environment.* | TRD §6.1, Plan §4, CLAUDE.md, README |
| D-23 | OI-03 Groq model | Initial model **`openai/gpt-oss-20b`**, configured only through `GROQ_MODEL` (never hard-coded). Use Groq Structured Outputs with a **strict JSON Schema** for the RAG response if the selected model supports it (see DD-27), and always validate the response in the backend. Model reasoning output is excluded where the API allows, and is never logged, persisted, or displayed. Availability and strict-schema behaviour must be confirmed by a live smoke test before Phase 6 exit. | TRD §9/§17, Schema §7.2, PRD §12, CLAUDE.md, README |
| D-24 | OI-04 Retrieval threshold | **Approved; value: Implementation-time calibration.** Calibrate `RETRIEVAL_MAX_DISTANCE` using the labelled dataset in Phase 6. Record the value, the method, and the dataset version here. Because the first dataset is small and calibration and evaluation use the same cases, report this overlap as a known limitation alongside the evaluation results. | TRD §7.4, Plan §9 |
| D-25 | OI-05 Low-text threshold | **Approved; value: Implementation-time calibration.** Determine `MIN_PAGE_TEXT_CHARS` from the synthetic corpus PDFs in Phase 4. The default (30) is provisional until then. Record the final value here. | TRD §7.4, Plan §7 |
| D-26 | OI-06 ChromaDB API | Use ChromaDB **`PersistentClient`** with the persistence directory from settings. Pin the tested `chromadb` version in `backend/requirements.txt`, and confirm the cosine-space and collection-metadata API against that version. | Schema §4.1, TRD §6.1, Plan §7, CLAUDE.md |
| D-27 | OI-07 Rate limits | **Evaluation runs** make at most **3 Groq attempts in total** for a transient failure (1 initial attempt + up to 2 retries) with backoff (DD-24; `Retry-After` honoured up to 15 s). If all 3 attempts fail, or `Retry-After` exceeds 15 s, the case is marked `failed` with `failure_type: infrastructure`. Infrastructure failures are not treated as incorrect AI answers: they are excluded from quality metrics and reported separately. *(Amended 2026-11-16: earlier wording allowed 1 + 3 retries; the product owner set the limit to 3 attempts in total.)* See the retry policy in TRD §9 and Schema §9.8. | Schema §2.7/§3.12/§9, TRD §9/§10.2/§17, App Flow §10, Plan §10 |
| D-28 | OI-08 Comparison API | Document comparison stays **outside the MVP**. No API contract is defined until the stretch phase. | PRD §8, App Flow §7, Plan §11 |

### Derived from D-23 and D-27 (approved 2026-11-16)

| ID | Status | Decision | Reason |
|---|---|---|---|
| DD-23 | Approved | Only transient failures are retried: `GROQ_RATE_LIMITED`, `GROQ_TIMEOUT`, and `LLM_PROVIDER_ERROR` caused by 5xx or connection errors. `GROQ_AUTHENTICATION_FAILED`, `LLM_RESPONSE_INVALID`, and every non-Groq error are not retried. | Retrying invalid output would hide model-quality problems; authentication errors are not transient. |
| DD-24 | Approved | `GROQ_MAX_ATTEMPTS=3` (1 initial attempt + up to 2 retries). Wait 1 s before attempt 2 and 2 s before attempt 3 (`GROQ_RETRY_BASE_SECONDS=1`, doubling). When the provider sends a `Retry-After` header, wait the longer of the backoff delay and `Retry-After`, so a retry never happens earlier than requested. If `Retry-After` exceeds `GROQ_MAX_RETRY_WAIT_SECONDS=15`, stop retrying that case and record it as `failed` with `failure_type: infrastructure`. *(Wait cap added by the product owner on 2026-11-16.)* | Makes "at most 3 attempts" concrete and stops one rate-limited case from stalling a run. |
| DD-25 | Approved | `failure_type` values: `infrastructure` (external dependency or environment: Groq transport, rate limit, timeout, authentication, or 5xx; vector store unavailable) and `pipeline` (all other case failures, for example invalid LLM output or an internal error). Neither type is scored as a pass or fail inside quality metrics (there is no output to score), so both are excluded from metric denominators. Both are always shown as separate counts next to the metrics, and pipeline failures appear as failed cases in the case table, so no exclusion is hidden. | Separates environment problems from quality problems. |
| DD-26 | Approved | Retries apply to evaluation cases only. Interactive user queries fail fast with the stable error code, and the user can ask again. | The approved decision was scoped to evaluation cases; it avoids long silent waits in the UI. |
| DD-27 | Approved | If the live smoke test shows the configured model does not support strict mode, the same JSON Schema is sent with `strict: false`. Backend Pydantic validation and the citation rules (schema §7.3) apply in both modes; invalid output still fails with `LLM_RESPONSE_INVALID`. The outcome is recorded in §4. | D-23 asks for strict mode only "if supported"; this defines the fallback without adding a dependency. |

## 3a. Phase 1 decisions (2026-11-17)

| ID | Status | Decision | Reason | Affected documents |
|---|---|---|---|---|
| D-29 | Approved | Use **Python 3.13** (standard 64-bit CPython, not free-threaded) for the backend, replacing D-22. The virtual environment is created with `py -3.13 -m venv backend/.venv`. Python 3.15 on the same machine is not used. *(Approved by the product owner on 2026-11-17.)* | Python 3.13 is installed on the development machine, and every approved backend package has a Python 3.13 Windows wheel (verified in Phase 1). | TRD §6.1/§18, PRD §12, Plan §4, CLAUDE.md, README |
| DD-28 | Awaiting approval | Add the backend setting `LOG_LEVEL` (`DEBUG`/`INFO`/`WARNING`/`ERROR`, default `INFO`) for the `app` logger. | The Phase 1 brief asked for logging configuration; a level setting is the smallest configurable form. No new dependency. | TRD §17, `backend/.env.example` |
| DD-29 | Approved (applies D-17/D-26) | PyTorch is installed **CPU-only** from the official index `https://download.pytorch.org/whl/cpu` (`torch==2.15.0+cpu`). All Python packages are installed as binary wheels (`--only-binary=:all:`); nothing is compiled from source. `backend/requirements.txt` pins the direct dependencies; `backend/requirements-lock.txt` pins the full tested environment; `backend/requirements-dev.txt` adds test and lint tools (pytest, httpx, ruff). | No GPU is required for the POC; CPU wheels are smaller and avoid a CUDA download. Pins make the environment reproducible. | TRD §6.1, README |
| DD-30 | Approved (applies frontend stack) | shadcn/ui is initialised with the Radix base and the `radix-nova` style (Lucide icons); colours are replaced by the project tokens in Phase 2. The `shadcn` package is a dev dependency (its CSS is used at build time only). The free React Bits registry is configured as `@react-bits` in `frontend/components.json`; components are added one at a time when needed. React Bits components that need GSAP (a second animation library next to Motion) require approval before they are added. | Follows the official shadcn Vite instructions and CLAUDE.md §9 (no duplicate libraries without a reason). | UI brief §4, TRD §2 |

## 4. Implementation-time calibration (values recorded during implementation)

| Item | Phase | Status |
|---|---|---|
| Exact Python patch version and pinned package versions | 1 | **Recorded 2026-11-17:** Python 3.13.16 (64-bit CPython, Windows). Backend pins: fastapi 0.163.1, uvicorn 0.54.0, pydantic 2.14.3, pydantic-settings 2.16.3, pymupdf 2.1, torch 2.15.0+cpu, sentence-transformers 6.3.0, chromadb 1.5.9, groq 1.7.0 (full list: `backend/requirements-lock.txt`). Frontend pins: `frontend/package.json` and `package-lock.json`. |
| Confirmation that `openai/gpt-oss-20b` is available to the account and honours the strict schema, or that the DD-27 fallback is needed (live smoke test) | 6 | Implementation-time calibration |
| Calibrated `RETRIEVAL_MAX_DISTANCE`, its method, and the dataset version | 6 | Implementation-time calibration |
| Final `MIN_PAGE_TEXT_CHARS` | 4 | Implementation-time calibration |
| Pinned `chromadb` version and its confirmed cosine/metadata API | 4 | Implementation-time calibration |

## 5. Open items

There are no open decisions. OI-01 to OI-08 are resolved by D-21 to D-28.

DD-28 (`LOG_LEVEL` setting) is awaiting approval. All other derived decisions DD-01 to DD-30 are approved, except DD-16 (superseded). The remaining items are DD-28 and the implementation-time calibration values in §4.
