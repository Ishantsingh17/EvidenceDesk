# Product Requirements Document (PRD)

## AI-Powered Enterprise Document Retrieval & Evidence Assistant

| Field | Value |
|---|---|
| Document type | Product Requirements Document |
| Version | 1.1 |
| Status | Baseline for POC development — revised 2026-11-16 (see `docs/07-DECISION-LOG.md`) |
| Product type | Academic / interview Proof of Concept |
| Primary use case | Finance, Accounts Payable (AP), and audit evidence retrieval |
| Intended audience | Product owner, developer, UI/UX designer, and interview reviewers |

---

## 1. Product summary

The AI-Powered Enterprise Document Retrieval & Evidence Assistant is a full-stack proof of concept that helps business users find answers inside a collection of business documents. Users upload PDF documents, ask questions in natural language, and receive responses grounded in retrieved document passages. Each response includes traceable source references such as the document name, page number, and supporting excerpt.

The prototype demonstrates a Retrieval-Augmented Generation (RAG) workflow and the business-analysis activities involved in delivering an enterprise-oriented solution: problem definition, requirements, process design, transparency, evaluation, and measurement.

The initial demonstration domain is Finance / Accounts Payable / Audit Operations. Example documents may include synthetic payment-approval policies, vendor-onboarding procedures, invoice-submission SOPs, expense policies, and internal-control documents. All sample data must be synthetic or public and must not contain confidential company or personal information.

**Working product name:** EvidenceDesk AI. This is a provisional name and can be changed without affecting the requirements.

## 2. Problem statement

Finance, AP, and audit employees may need to search multiple policy documents, standard operating procedures, invoices, and supporting files to answer routine questions or locate evidence. Manual searching can take time, depends on users knowing where information is stored, and makes it harder to consistently identify the exact source passage.

The POC will test whether a document-grounded AI assistant can make information retrieval more accessible while preserving source traceability and providing a safe fallback when the uploaded documents do not contain sufficient evidence.

## 3. Product vision

Provide a simple, transparent workspace where a business user can:

1. Upload a small collection of business PDF documents.
2. See the document-processing stages and their actual status.
3. Ask questions in natural language.
4. Receive an answer grounded only in relevant retrieved content.
5. Inspect the source documents, page references, and supporting excerpts.
6. Evaluate retrieval and answer quality using a labelled test set.

## 4. Goals and objectives

### 4.1 Product goals

- Demonstrate an end-to-end, working RAG pipeline.
- Reduce the effort required to locate information in a controlled document set.
- Make responses verifiable through source citations and excerpts.
- Demonstrate observable processing stages rather than hiding the AI workflow.
- Assess the system using a repeatable evaluation dataset.
- Demonstrate full-stack implementation and business-analysis thinking.

### 4.2 Interview demonstration goals

The POC should let the developer explain:

- The business problem and its stakeholders.
- The current-state (AS-IS) and proposed (TO-BE) process.
- Functional requirements and acceptance criteria.
- The difference between an LLM, embeddings, vector search, and RAG.
- Why Groq is used for LLM inference while a separate embedding model is used for vectorisation.
- How retrieval quality, answer faithfulness, citations, and latency are evaluated.
- Security, reliability, and limitations of the prototype.

## 5. Non-goals and out of scope

The initial POC is not intended to be a production-ready enterprise content-management platform. The following are out of scope unless explicitly added later:

- Production deployment, high availability, horizontal scaling, or disaster recovery.
- Enterprise SSO, role-based access control, multi-tenancy, or complex user administration.
- Connecting to live Oracle, SAP, SharePoint, Ariba, or other enterprise systems.
- Processing confidential, regulated, or real customer/company documents.
- OCR for scanned PDFs; the first version handles PDFs with extractable text and reports when text cannot be extracted.
- Reliable extraction of complex tables, handwriting, diagrams, or image-only pages.
- Autonomous agents, multi-agent workflows, MCP integrations, or autonomous business actions.
- Fine-tuning a foundation model.
- Editing documents or initiating payments, approvals, vendor changes, or other transactions.
- Guaranteeing legal, financial, audit, or compliance decisions.

## 6. Target users and stakeholders

| User / stakeholder | Need | Expected value |
|---|---|---|
| Finance / AP analyst | Find policy or process information quickly | Less manual document searching |
| Auditor / audit associate | Locate supporting evidence and verify its origin | Better traceability during evidence review |
| Business process owner | Understand where information is located and how it is used | More consistent access to procedure information |
| POC administrator / developer | Upload documents, inspect processing, and run evaluations | Easier demonstration, testing, and troubleshooting |
| Interview reviewer | Understand the business use case and technical implementation | A tangible demonstration of BA and AI capability |

The POC is single-user/local by default. The user roles above describe stakeholder perspectives, not implemented authentication roles.

## 7. Primary use cases

### UC-01: Upload and index documents

A user uploads one or more PDF documents. Each file is uploaded and processed independently. The system validates each file before processing (rejecting duplicates), extracts text page by page with page-level diagnostics, divides the text into chunks, generates embeddings, and stores the vectors and metadata. The UI displays each processing stage and the final result. A failed or outdated document can be reprocessed (creating a new processing job) or deleted.

### UC-02: Ask a question about uploaded documents

A user asks a natural-language question. The system embeds the query, retrieves relevant chunks, sends the question and retrieved context to the Groq-hosted LLM, and returns a grounded answer with source references. Each question is independent; the MVP has no conversation memory. Past questions are available in a query history.

### UC-03: Inspect answer evidence

A user opens a citation to inspect the source filename, page number, and text excerpt that supports the answer. Citations show only the sources the answer actually cited; all retrieved chunks are available separately as retrieval details.

### UC-04: Handle unsupported questions

A user asks a question for which the document collection does not contain sufficient information. The system returns a clear insufficient-evidence response rather than fabricating an answer. This is a normal, successful outcome, not an error.

### UC-05: Compare two policy documents

A user selects two indexed documents or versions and asks for a comparison. The system retrieves relevant content from both documents and presents a structured comparison with separate citations for each side. This feature is a stretch goal after the core RAG workflow is reliable.

### UC-06: Evaluate system quality

A user runs a prepared, versioned evaluation dataset. The system compares retrieval results and generated responses with labelled expected answers and expected source references, then presents transparent metric results and examples. A reviewer records in-app human ratings for correctness, faithfulness, and citation validity, with comments. Evaluation runs do not count as user queries.

## 8. Scope and prioritisation

### Must have (MVP)

- React application shell with navigation (light theme).
- PDF upload with synchronous validation, duplicate rejection, and document listing with filename search and status filter.
- Text extraction with page-level metadata and diagnostics.
- Configurable chunking and embedding generation.
- Persistent ChromaDB vector collection guarded against mixed embedding models.
- Document reprocess (new job) and deletion.
- Natural-language query flow using Groq for generation, with structured output.
- Source citations created from retrieved backend metadata; separate retrieval details.
- Insufficient-context fallback.
- Real document-processing, query-processing, and evaluation status events with replay.
- Basic query history for the current local POC.
- Versioned evaluation dataset with retrieval and answer checks, per-case drill-down, and in-app human review.
- Error, loading, empty, warning, and success states.
- Local setup instructions and environment-variable configuration, including an explicit mock/live API mode.

### Should have

- User feedback on an answer (helpful / not helpful, optional comment).
- Evaluation run history and run-to-run comparison.

### Stretch (after all MVP exit criteria pass)

- Document comparison for two policy documents.
- Document-type filter.
- Export of an evaluation result summary to CSV or JSON.
- Dark theme.

### Could have

- RAGAS-based or LLM-judge supplementary evaluation, labelled as automated estimates.
- Reranking of retrieved chunks.
- More advanced hybrid keyword + semantic retrieval.
- A PDF preview panel with page navigation.
- OCR for scanned documents in a future iteration.

### Will not have in the initial POC

- Enterprise system integrations or autonomous actions.
- Multi-agent orchestration.
- Production authentication and authorisation.
- Conversation memory / multi-turn context.
- Cancellation of running processing jobs.

## 9. Functional requirements

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-01 | Upload PDF documents | Must | User can upload one or more PDF files; each file is an independent upload and job. Invalid file types, oversized files, and unparseable PDFs receive clear errors before any processing starts. |
| FR-02 | Validate and register documents | Must | Each accepted file receives a unique document ID, status, filename, size, SHA-256 hash, and upload timestamp. A file whose SHA-256 matches an existing document is rejected with HTTP 409 and a link to the existing document. |
| FR-03 | Extract text page by page | Must | Extracted text retains page numbers; per-page statistics and warnings are stored; documents with no extractable text are marked `needs_ocr`; documents with some low-text pages are marked `completed_with_warnings`. |
| FR-04 | Chunk extracted text | Must | Text is split into overlapping chunks using configurable token-based settings. |
| FR-05 | Generate embeddings | Must | Each chunk is converted into a vector using the configured local embedding model. |
| FR-06 | Index vectors | Must | Embeddings and source metadata are stored in a persistent ChromaDB collection whose metadata records the embedding model and dimension; embeddings from different models are never mixed. |
| FR-07 | Display processing timeline | Must | UI shows real stage changes, progress/status, timestamps or durations, and failures from backend events, and recovers the timeline after refresh or reconnect. |
| FR-08 | Submit natural-language query | Must | User can submit a question against the indexed collection. Each question is independent of previous questions. |
| FR-09 | Retrieve relevant content | Must | Backend returns the configured top-k relevant chunks and their source metadata, from fully indexed documents only. |
| FR-10 | Generate grounded answer | Must | Groq receives the question and labelled retrieved context; prompt requires the model to use only that context and return structured output including an insufficient-evidence flag and a review flag. |
| FR-11 | Display citations | Must | Citations are generated from backend retrieval metadata for the source labels the answer cited and the backend validated, and show filename, page, and supporting excerpt. All retrieved chunks are shown separately as retrieval details. |
| FR-12 | Refuse unsupported questions | Must | When evidence is insufficient (no retained evidence, model-reported, or no valid citations), the application returns an explicit fallback as a normal HTTP 200 result and does not invent a source. |
| FR-13 | Display query timeline | Must | UI displays actual query stages: question received, query embedding, retrieval, context preparation, generation, and citation validation, including skipped stages. |
| FR-14 | Run evaluation | Must | User can execute a versioned, labelled evaluation dataset and inspect per-case outcomes, including failed cases. Evaluation runs do not affect user query statistics. |
| FR-15 | Report retrieval metrics | Must | Evaluation reports Recall@k, Precision@k, and MRR at the unique (document, page) level where ground-truth sources exist. |
| FR-16 | Report generation metrics | Must | Evaluation reports abstention correctness and citation source match (rule-based) and answer correctness, faithfulness, and citation validity (human-reviewed), each with its method and sample count. |
| FR-17 | Report latency | Must | Retrieval, generation, end-to-end, and evaluation durations are measured where available. |
| FR-18 | View dashboard summary | Should | Dashboard shows actual document, user-query, and evaluation counts from the backend. |
| FR-19 | Compare two documents | Stretch | Comparison presents differences or key information with citations to both documents. |
| FR-20 | Capture feedback | Should | User can mark an answer helpful or not helpful and optionally add a comment. |
| FR-21 | View query history | Must | User can list previous questions with status and timestamp and reopen a stored result. |
| FR-22 | Reprocess a document | Must | User can reprocess an indexed, failed, or needs-OCR document; each reprocess creates a new processing job. Not allowed while the document is queued or processing. |
| FR-23 | Delete a document | Must | User can delete a document with confirmation; the file, vectors, and document metadata are removed, historical query and evaluation snapshots are preserved, partial failures are reported, and deletion is not allowed while the document is queued or processing. |
| FR-24 | Review evaluation results | Must | A reviewer can record, per evaluation case, a correctness rating, faithfulness rating, citation validity, and comment; aggregates show reviewed counts. |

## 10. Non-functional requirements

### Reliability

- Processing jobs must end in a clear completed or failed state.
- A failure at one stage must not be represented as successful completion.
- A malformed PDF or provider error must return a readable error without crashing the entire application.
- Re-uploading the same file is rejected using its SHA-256 hash (HTTP 409).
- Work interrupted by a server restart is recovered on startup into a clear failed/interrupted state, never left as "running".

### Performance

- Record extraction, embedding, retrieval, generation, and end-to-end durations.
- Do not promise a fixed response-time target until measured on the development environment and sample corpus.
- Use configurable batch sizes and top-k retrieval settings.

### Security and privacy

- Keep Groq credentials only on the backend in environment variables.
- Never expose secrets in frontend code, browser requests, screenshots, logs, or Git commits.
- Use synthetic/public documents only for the POC.
- Validate file extension, MIME type, size, and parseability.
- Restrict CORS to the local frontend origin during development.
- Do not log full document contents or API keys.

### Usability and accessibility

- Provide clear loading, empty, error, and success states.
- Keep primary workflows understandable without technical knowledge.
- Support keyboard navigation and visible focus indicators.
- Respect reduced-motion settings.
- Ensure colour is not the only way to communicate status.

### Maintainability

- Keep frontend and backend concerns separate.
- Use typed API contracts and modular services.
- Keep model names, chunk parameters, retrieval settings, and upload limits configurable.
- Document environment setup and evaluation assumptions.

## 11. Success measures and evaluation approach

The POC will be assessed using a labelled test set rather than unsupported claims about productivity gains.

| Dimension | Proposed measurement |
|---|---|
| Retrieval | Precision@k, Recall@k, and Mean Reciprocal Rank (MRR) against expected sources at the unique (document, page) level (rule-based) |
| Answer quality | Answer correctness rated in-app by a human reviewer against the expected answer and rubric; an LLM-judge score is an optional, separately labelled stretch |
| Faithfulness | Whether answer claims are supported by retrieved context, rated in-app by a human reviewer; RAGAS is an optional secondary stretch metric |
| Citation support | Rule-based check that cited file/page locations match expected sources, plus a human citation-validity rating of whether each excerpt supports the claim |
| Abstention | Whether unanswerable and out-of-scope questions produce an insufficient-evidence response and answerable questions do not (rule-based) |
| Prompt-injection resistance | Whether answers avoid content that an embedded instruction tried to force (rule-based) |
| Performance | Median and p95 query latency, plus retrieval and generation durations |
| Business relevance | Timed manual-search versus POC-assisted task comparison on the same controlled questions, conducted as a manual study outside the application |

Initial test design: 5–10 synthetic/public business documents (committed in `sample-corpus/`) and approximately 15–20 labelled questions in a versioned JSON seed dataset, created during early project setup. Use the categories `direct`, `multi_document`, `ambiguous`, `conflicting_documents`, `unanswerable`, `out_of_scope`, and `prompt_injection`, with at least one case per category. Report sample size and scoring method beside every metric. Do not invent or pre-fill performance percentages.

## 12. Assumptions and dependencies

- Development is local and intended for an interview demonstration.
- The first version processes text-based PDFs, not scanned/image-only PDFs.
- Groq is the LLM inference provider. The initial model is `openai/gpt-oss-20b`; it is configurable through `GROQ_MODEL` and must be checked against the account's currently available models.
- The backend runs on Python 3.13 (64-bit CPython; decision D-29).
- Sentence Transformers runs locally for embeddings; the initial candidate is `sentence-transformers/all-MiniLM-L6-v2`.
- ChromaDB provides persistent vector storage.
- SQLite stores POC metadata, job states, query logs, and evaluation records.
- Uploaded PDFs are stored locally during the POC.
- The backend runs as a single local process (one Uvicorn worker).
- Internet access is required for Groq inference and initial model download, but local extraction, embedding, and vector search can run locally after setup.

## 13. Risks and mitigations

| Risk | Potential impact | Mitigation |
|---|---|---|
| Poor PDF text extraction | Missing or incorrect context | Detect low-text pages, show warnings, test with representative PDFs, defer OCR to a later release. |
| Poor retrieval | Wrong evidence reaches the LLM | Tune chunk size, overlap, top-k, and distance threshold with labelled questions; inspect retrieved chunks. |
| LLM hallucination | Unsupported business answer | Grounding prompt, evidence threshold, abstention, source citations, and evaluation. |
| Incorrect citations | Loss of trust | Generate citations from retrieved metadata in backend code, never rely on model-invented page numbers. |
| Groq model/API change or rate limit | Query failure | Make model configurable, handle provider errors, document fallback behaviour, and verify current model availability. |
| API key exposure | Credential misuse | Backend-only key, `.env` excluded from Git, `.env.example` contains placeholders only. |
| Misleading evaluation scores | Overstated quality | Use labelled ground truth, document metric definitions, display sample count, separate human and automated scores. |
| Over-designed UI | Reduced usability and development time | Use a consistent design system, purposeful animations, accessibility checks, and screen-by-screen delivery. |

## 14. Definition of done

The POC is ready for demonstration when:

1. A user can upload at least one valid text-based PDF and see its real processing stages.
2. The document is indexed in persistent ChromaDB storage with page-level metadata.
3. A user can ask a question and receive a grounded answer using Groq.
4. The response includes backend-generated document/page citations and supporting excerpts.
5. An unsupported question returns a clear insufficient-evidence response.
6. Query stages and durations reflect actual backend events.
7. A labelled evaluation set can be executed, its per-question results inspected, and human reviews recorded.
8. The evaluation dashboard displays measured results and sample size rather than placeholder claims.
9. The frontend works at desktop and mobile/tablet widths and provides loading, empty, error, and success states.
10. The project can be run from documented local setup instructions without exposing credentials.

---

## 15. Glossary

| Term | Meaning |
|---|---|
| LLM | Large Language Model; generates text from a prompt and context. |
| RAG | Retrieval-Augmented Generation; retrieves external information and supplies it as context to an LLM. |
| Embedding | Numerical representation of text used for similarity search. |
| Vector database | Store and search system for embeddings and associated metadata. |
| Chunk | A segment of document text indexed and retrieved independently. |
| Faithfulness | Whether generated claims are supported by the supplied context. |
| Recall@k | Fraction of expected relevant items found in the top k retrieved items. |
| Precision@k | Fraction of the top k retrieved items that are relevant. |
| MRR | Mean Reciprocal Rank; rewards relevant results appearing higher in the ranked list. |
| Abstention | The system declines to answer when evidence is insufficient. |
| Retrieval details | The full ranked list of retrieved chunks for a question, shown separately from the citations the answer actually used. |
