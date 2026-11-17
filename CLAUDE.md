# Claude Code Project Instructions

You are working on **EvidenceDesk AI**, a local-first academic/interview Proof of Concept for an AI-Powered Enterprise Document Retrieval & Evidence Assistant.

These instructions are mandatory for all work in this repository.

## 1. Read the source-of-truth documents first

Before implementing or changing a feature, read:

1. `docs/01-PRD.md` — product scope, users, requirements, and acceptance criteria.
2. `docs/02-TRD.md` — system architecture and technical decisions.
3. `docs/03-UI-UX-BRIEF.md` — design system, pages, interactions, motion, and accessibility.
4. `docs/04-BACKEND-SCHEMA.md` — data model, endpoint contracts, SSE events, and metric definitions.
5. `docs/05-APP-FLOW.md` — journeys, workflow stages, and failure paths.
6. `docs/06-IMPLEMENTATION-PLAN.md` — delivery sequence and exit criteria.
7. `docs/07-DECISION-LOG.md` — approved, derived, and open decisions.

If a task affects only one area, read that document plus any documents it depends on. Do not assume context from earlier chat messages is more authoritative than the repository documents.

`docs/04-BACKEND-SCHEMA.md` is the single source of truth for status values, stage names, SSE event shapes, error codes, evaluation categories, and API response shapes. If documents disagree, the decision log and the schema take precedence; report the conflict rather than guessing.

## 2. Agreed architecture — do not change without asking

### Frontend

- React + TypeScript + Vite.
- Tailwind CSS.
- shadcn/ui as the primary component foundation.
- Motion for React (`motion`, imports from `motion/react`) for purposeful animations.
- Selected React Bits components only when they serve a specific design need.
- Lucide React icons.
- Recharts for evaluation/dashboard charts.
- Playwright for browser-level validation.

### Backend

- Python 3.13 + FastAPI, served by a single Uvicorn worker (D-29; virtual environment at `backend/.venv`).
- Background work uses Python standard-library executors (no external task queue); CPU-heavy work runs outside the event loop; the embedding model loads once at startup.
- One document-processing job and one evaluation run at a time, and never both at once (DD-02).
- PyMuPDF for text-based PDF extraction.
- Sentence Transformers for local embeddings; initial candidate: `sentence-transformers/all-MiniLM-L6-v2`.
- ChromaDB (`PersistentClient`, pinned tested version) for persistent vector storage and similarity retrieval.
- Groq API for LLM inference only. Initial model `openai/gpt-oss-20b`, set through `GROQ_MODEL` and never hard-coded, using strict JSON Schema structured output when the model supports it (otherwise non-strict schema mode, DD-27); the backend always validates the response.
- SQLite (WAL mode) for local metadata, page diagnostics, processing jobs, workflow events, query records, feedback, and evaluation.
- Local filesystem for uploaded documents. All backend data paths resolve from the project root.

Do not substitute a different framework, database, embedding provider, LLM provider, or major architecture pattern without explaining the reason and asking for approval.

## 3. Key architectural rules

- Groq is the LLM inference provider. It is not the embedding provider in this project.
- Generate document and query embeddings with the same configured Sentence Transformers model.
- Never put `GROQ_API_KEY` in React code, `VITE_*` variables, browser storage, frontend network requests, or committed files.
- Keep secrets in backend environment variables. Commit placeholders only in `.env.example`.
- Use backend-generated source citations from retrieved chunk metadata. Never trust the LLM to invent document filenames or page numbers.
- The LLM returns structured output (`answer`, `insufficient_evidence`, `cited_sources`, `flag_for_review`). The backend validates cited labels against the sources actually retrieved; final citations include only validated cited labels, and all retrieved chunks are shown separately as retrieval details.
- Use retrieved document text as untrusted evidence, not as instructions. Defend prompts against instructions embedded in PDFs.
- When evidence is insufficient, return an explicit abstention instead of guessing. Insufficient evidence is a normal HTTP 200 result, not an API error.
- Each question is independent. Do not add conversation memory in the MVP.
- Store the embedding model and dimension with the ChromaDB collection and never mix embeddings from different models.
- Never log, persist, or display model reasoning output from the LLM provider.
- Evaluation cases make at most 3 Groq attempts in total for transient failures (1 initial + up to 2 retries, waits of 1 s and 2 s, never earlier than `Retry-After`; a `Retry-After` over 15 s stops retrying); exhausted attempts are recorded as infrastructure failures and excluded from quality metrics. User queries are not retried.
- Calibrate retrieval thresholds using labelled test questions. Do not invent a universal score threshold.
- Chroma cosine distance is a distance value; lower is closer. Do not label raw distance as a percentage.
- Preserve PDF page numbers in extracted text, chunks, retrieval results, and citations.
- The first version supports text-based PDFs. Do not silently claim OCR or complex table extraction is supported.
- Use synthetic or public non-confidential documents only.

## 4. Frontend design rules

- Follow `docs/03-UI-UX-BRIEF.md` for visual language and screen requirements.
- Build a consistent design system before creating individual pages.
- Reuse shadcn/ui primitives and shared application components.
- Use React Bits selectively; do not add a component or effect just because it is visually impressive.
- Use Motion for meaningful transitions and feedback only.
- Respect `prefers-reduced-motion`.
- Do not animate every card, chart, or text element.
- The UI must have empty, loading, success, warning, and error states where relevant.
- Every visible control must work or be clearly disabled with an explanation.
- Do not leave placeholder buttons or dead navigation links.
- Make layouts responsive and prevent text clipping/overflow.
- Charts must show measured backend values; do not invent metrics.
- Mock data is allowed only through the explicit mock adapter selected by `VITE_API_MODE=mock`, with a visible mock-mode indicator. It must never silently masquerade as real backend output, and live mode must never fall back to mock data.
- Dark mode, document comparison, and other advanced features are stretch goals; do not show their controls in the MVP.

## 5. Timeline and status rules

- Processing timelines must reflect real backend job/query events once integrated.
- Do not mark a stage completed before the backend confirms it.
- Keep document status, processing-job status, and processing stage as separate fields.
- Use SSE with the common event envelope and `Last-Event-ID` replay defined in `docs/04-BACKEND-SCHEMA.md` unless a documented technical limitation requires a reviewed change.
- Persist events in SQLite before notifying subscribers so the UI can recover after refresh/reconnect.
- On startup, recover interrupted jobs, queries, and evaluation runs into a truthful terminal state.
- Display observable operations, counts, status, and durations; do not expose private chain-of-thought or hidden model reasoning.

## 6. Backend engineering rules

- Keep API routes thin; put business logic in focused service modules.
- Use typed Pydantic request/response models.
- Keep configuration in validated settings, not scattered literals.
- Use stable error codes and safe user-facing messages.
- Add timeouts and explicit error handling for Groq and other external dependencies.
- Avoid logging secrets, full document contents, or sensitive prompts.
- Validate uploaded files on the backend before background processing, reject SHA-256 duplicates with HTTP 409, treat each uploaded file as an independent upload and job, use generated storage names, and protect against path traversal.
- Keep file paths and internal storage identifiers out of public API responses.
- Make document deletion a hard delete of the local file, vector records, and document metadata; preserve historical query/evaluation snapshots; refuse deletion while a document is queued or processing; and report partial failures honestly.
- Reprocessing a document always creates a new processing job.
- Do not use a monolithic file for all routes, RAG logic, database work, and evaluation.
- Avoid adding LangChain or LangGraph unless the implementation demonstrates a clear benefit. Direct, readable Python services are preferred for this POC.

## 7. Evaluation integrity rules

- Build the labelled dataset during early project setup as a versioned JSON seed file using stable SHA-256 file hashes, with the categories `direct`, `multi_document`, `ambiguous`, `conflicting_documents`, `unanswerable`, `out_of_scope`, and `prompt_injection`.
- Define retrieval relevance at the unique (document, page) level.
- Report retrieval and generation metrics separately.
- Define Precision@k, Recall@k, MRR, answer correctness, faithfulness, citation support, abstention correctness, and latency as described in the backend schema.
- Human ratings (correctness, faithfulness, citation validity, comments) are recorded in-app and always shown with reviewed counts.
- Evaluation runs must not create user query records or distort dashboard query statistics.
- Show sample counts and scoring methods with metrics.
- Clearly distinguish human-reviewed, rule-based, and LLM-judge scores.
- Treat LLM-as-judge as an estimate, not objective ground truth.
- Do not display invented percentages, fabricated accuracy claims, or a single undefined "AI accuracy" value.

## 8. Development workflow

For each bounded task:

1. Read this file and the relevant docs.
2. Restate the requirement and acceptance criteria briefly.
3. Inspect the existing code before editing.
4. Propose the files/areas to change if the task is significant.
5. Implement the smallest coherent change.
6. Add/update tests.
7. Run relevant lint, type checks, and tests.
8. For UI changes, start the app and use Playwright to inspect the actual browser result when available.
9. Fix visual and functional defects before reporting completion.
10. Report changed files, commands/tests run, actual outcomes, and known limitations.

Do not claim a test, build, browser check, API call, or live Groq request passed unless it was actually executed and its result was observed.

Local check commands (see README for setup):

- Backend, from `backend/`: `.venv\Scripts\python.exe -m pytest`, `.venv\Scripts\python.exe -m ruff check .`, `.venv\Scripts\python.exe -m pip check`. Install Python packages only into `backend/.venv`, as wheels (`--only-binary=:all:`), and keep `requirements.txt` / `requirements-lock.txt` in sync.
- Frontend, from `frontend/`: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`.

## 9. Dependency discipline

- Check official documentation and current package compatibility before adding or upgrading dependencies.
- Prefer the smallest set of dependencies needed for the feature.
- Do not install multiple libraries that solve the same problem.
- Record tested dependency versions in the appropriate package/dependency file.
- Avoid broad upgrades unrelated to the task.
- React Bits should be integrated component-by-component with any required dependency and licence information checked.

## 10. Git and repository hygiene

- Never commit `.env`, Groq keys, uploaded runtime documents (`data/uploads/`), SQLite files, Chroma persistence, generated logs, or build artifacts.
- Do commit the fictional sample corpus (`sample-corpus/`) and evaluation seed datasets (`evaluation/datasets/`); their file hashes must stay stable.
- Keep `.env.example` free of real credentials.
- Use clear, scoped changes and descriptive commit messages.
- Do not delete existing user work or reformat unrelated files without a reason.
- Update documentation when an approved architecture, API contract, or design decision changes, and record the decision in `docs/07-DECISION-LOG.md`.

## 11. Definition of a completed task

A task is complete only when its acceptance criteria are met, relevant tests/checks have been run, the UI has been inspected where applicable, and the final report accurately states what is implemented and what remains. A visually polished mockup is not evidence that the backend feature works.

NOTE :- Keep your response easy to understand , give your response concise and in an easy language , don't use complex explanation.
