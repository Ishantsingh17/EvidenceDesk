# EvidenceDesk AI — Project Documentation

This repository contains the baseline product and technical documentation for the **AI-Powered Enterprise Document Retrieval & Evidence Assistant**, an academic/interview Proof of Concept.

## Documents

| File | Purpose |
|---|---|
| `docs/01-PRD.md` | Problem, users, goals, scope, requirements, risks, and success measures. |
| `docs/02-TRD.md` | Architecture, technology stack, RAG pipeline, security, testing, and configuration. |
| `docs/03-UI-UX-BRIEF.md` | Visual direction, page layouts, reusable components, motion, and accessibility. |
| `docs/04-BACKEND-SCHEMA.md` | SQLite/Chroma data model, API contracts, SSE events, and evaluation metric definitions. |
| `docs/05-APP-FLOW.md` | User journeys, sequence flows, processing timelines, and failure paths. |
| `docs/06-IMPLEMENTATION-PLAN.md` | Phased delivery plan, milestones, acceptance criteria, and Claude Code workflow. |
| `docs/07-DECISION-LOG.md` | Approved, derived, and open decisions. |
| `CLAUDE.md` | Persistent instructions for Claude Code. |

`docs/04-BACKEND-SCHEMA.md` is the single source of truth for statuses, stages, events, error codes, evaluation categories, and API shapes.

## Agreed architecture

- Frontend: React + TypeScript + Vite, Tailwind CSS, shadcn/ui, Motion for React, Lucide React, Recharts.
- Backend: Python 3.13 + FastAPI, single Uvicorn worker, standard-library background executors.
- PDF extraction: PyMuPDF.
- Embeddings: local Sentence Transformers (`sentence-transformers/all-MiniLM-L6-v2` initially), loaded once at startup.
- Vector database: ChromaDB (cosine distance; collection records embedding model and dimension).
- LLM inference: Groq API, initial model `openai/gpt-oss-20b` (configurable via `GROQ_MODEL`), strict JSON Schema output where the model supports it, always validated by the backend.
- Metadata: SQLite (WAL mode).
- Local file storage for the POC; all data paths resolve from the project root.
- Real-time status: Server-Sent Events with replay.
- Browser validation: Playwright.

Groq is used for LLM inference only. Embeddings are generated separately using Sentence Transformers.

## Repository layout (target)

- `frontend/` — React app. `frontend/.env`: `VITE_API_BASE_URL`, `VITE_API_MODE=live|mock`.
- `backend/` — FastAPI app. `backend/.env` holds secrets (never committed).
- `sample-corpus/` — committed fictional PDFs used for demos and evaluation.
- `evaluation/datasets/` — committed versioned JSON seed datasets.
- `data/` — runtime uploads, ChromaDB, and SQLite (never committed).

## Important POC limitations

- Use synthetic or public non-confidential documents only.
- The initial scope supports text-based PDFs; OCR is out of scope.
- This is a local single-user POC, not a production enterprise platform.
- Each question is answered independently; there is no conversation memory.
- Dark mode, document comparison, and advanced features are stretch goals.
- Do not put the Groq API key in the frontend or commit it to Git.
- Evaluation values must come from a labelled dataset and documented scoring methods; do not use fabricated benchmark claims.

## Local setup (Windows)

Prerequisites: Python **3.13** (64-bit CPython, via the `py` launcher), Node.js 24+, npm 11+, Git.

### Backend

```powershell
py -3.13 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install --upgrade pip setuptools wheel
# Wheels only; PyTorch is CPU-only from the official PyTorch index (set inside the file).
backend\.venv\Scripts\python.exe -m pip install --only-binary=:all: -r backend\requirements-dev.txt
copy backend\.env.example backend\.env   # then set GROQ_API_KEY in backend\.env only
```

`backend/requirements.txt` pins the direct dependencies; `backend/requirements-lock.txt` pins the full tested environment.

Run (single worker), from `backend/`:

```powershell
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Health check: `http://127.0.0.1:8000/api/v1/health`. Data is written to the root `data/` folder.

Checks, from `backend/`: `.venv\Scripts\python.exe -m pytest` and `.venv\Scripts\python.exe -m ruff check .`

### Frontend

```powershell
cd frontend
npm ci
npx playwright install chromium   # once, for browser tests
npm run dev                       # http://localhost:5173
```

Optional: copy `frontend/.env.example` to `frontend/.env.local` to change `VITE_API_BASE_URL` or `VITE_API_MODE`.

Checks: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e` (starts the backend and frontend automatically).

### Claude Code

1. Open this folder in Claude Code and approve the project's Playwright MCP server (`.mcp.json`) when asked.
2. Ask Claude Code to read `CLAUDE.md` and the seven documents in `/docs`.
3. Follow `docs/06-IMPLEMENTATION-PLAN.md` phase by phase.
