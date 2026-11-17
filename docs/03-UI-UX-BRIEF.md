# UI/UX Brief

## AI-Powered Enterprise Document Retrieval & Evidence Assistant

| Field | Value |
|---|---|
| Document type | UI/UX Design Brief |
| Version | 1.2 |
| Status | Design system implemented in Phase 2A — revised 2026-11-17 (see `docs/07-DECISION-LOG.md` DD-34) |
| Design direction | Premium enterprise SaaS / intelligence workspace |

---

## 1. Product experience objective

Create a polished, modern enterprise workspace that makes document retrieval and AI-assisted evidence discovery feel reliable, understandable, and efficient. The product should look like a credible business application, not a generic chatbot, gaming interface, or flashy AI landing page.

The interface must make the system's work visible: users should understand which documents are indexed, what stage a query is in, which source passages were retrieved, and how the evaluation results were calculated.

## 2. Primary design principles

1. **Clarity over decoration:** the user should immediately understand what they can do and what the system has done.
2. **Evidence before effects:** source references and supporting excerpts are more important than animated visual flourishes.
3. **Consistent design system:** every page uses the same typography, spacing, colour, component, and interaction rules.
4. **Purposeful motion:** animations explain state changes, progress, hierarchy, or interaction. Avoid continuous decorative movement.
5. **Honest status:** show real backend states and errors. Never animate a failed or pending action as completed.
6. **Accessible by default:** support keyboard use, readable contrast, clear focus, and reduced motion.
7. **Responsive layouts:** desktop is the main demonstration target, but screens should work at tablet and mobile widths.

## 3. Brand and visual direction

**Working product label:** EvidenceDesk AI. This is a provisional in-app label.

**Visual personality:** confident, calm, precise, professional, modern, transparent, and data-oriented.

### 3.1 Design tokens (implemented in Phase 2A)

The MVP **light theme** is implemented in `frontend/src/index.css` as CSS variables, exposed to Tailwind through `@theme inline`. Refinements to the initial values are listed in the "Change" column; apply any further change in `index.css` only and update this table. Dark-theme tokens are a stretch goal and are not defined for the MVP.

| Brief token | Implemented variable (shadcn/ui) | Value | Change from initial | Usage |
|---|---|---|---|---|
| `--background` | `--background` | `#F7F8FC` | — | Main canvas |
| `--surface` | `--card`, `--popover` | `#FFFFFF` | — | Cards, panels, menus |
| `--surface-muted` | `--muted`, `--secondary` | `#F1F3F9` | — | Secondary panels, hover backgrounds |
| — | `--accent` / `--accent-foreground` | `#EEF0FB` / `#2E2A8F` | New | Icon tiles, selected tints |
| `--foreground` | `--foreground` | `#131A2B` | Was `#111827`: bluer "ink" to match the sidebar | Main text |
| `--muted-foreground` | `--muted-foreground` | `#5B6478` | Was `#667085`: darker for WCAG AA on the canvas | Secondary text |
| `--primary` | `--primary` / `--primary-hover` | `#4F46E5` / `#4338CA` | Hover token added | Primary actions, focus ring |
| — | `--evidence` | `#0E7A72` | New secondary accent | Cited / verified evidence (sparingly) |
| `--nav-background` | `--sidebar` | `#0E1626` | Was `#111827`: deep ink-blue | Sidebar |
| — | `--sidebar-foreground` / `--sidebar-muted` / `--sidebar-accent` / `--sidebar-primary` | `#D5DBE7` / `#8D97AB` / `#1A2438` / `#A5A0FF` | New | Sidebar text, hover/active background, active indicator |
| `--success` (+ soft) | `--success` / `--success-soft` | `#15803D` / `#ECFDF3` | Soft tint added | Success badges |
| `--warning` (+ soft) | `--warning` / `--warning-soft` | `#B45309` / `#FFF6E5` | Soft tint added | Warning badges, mock-mode banner |
| `--danger` (+ soft) | `--destructive` / `--danger-soft` | `#B42318` / `#FEF3F2` | Soft tint added | Error badges |
| `--info` (+ soft) | `--info` / `--info-soft` | `#2563EB` / `#EFF5FF` | Soft tint added | Info / in-progress badges |
| `--border` | `--border` / `--input` | `#E4E7EE` / `#D6DBE6` | Slightly cooler | Dividers, card and input borders |
| `--radius-card` | `--radius-card` (`rounded-xl`) | `12px` | Was 14px: less "bubbly" | Cards and panels |
| `--radius-control` | `--radius` (`rounded-lg`) | `8px` | Was 9px | Buttons, inputs, badges (`6px`) |
| — | `--shadow-card` / `--shadow-raised` | soft 1–2px / 6–16px | New | Resting cards / hovered interactive cards |

Do not rely on colour alone for state. Pair colour with a label and/or icon. All text/background pairs above meet WCAG AA (4.5:1) for body text.

### 3.2 Typography

- Typeface: **IBM Plex Sans** (variable, `@fontsource-variable/ibm-plex-sans`, OFL-1.1) with a system sans-serif fallback. Chosen over the shadcn default Geist because its document-and-enterprise character and clear tabular figures suit an evidence workspace. One family only.
- Type scale (Tailwind utilities from `index.css`):

| Utility | Size / line height | Use |
|---|---|---|
| `text-title` | 24 / 32 px, semibold | Page title (`h1`, one per page) |
| `text-metric` | 28 / 34 px, medium, tabular figures | KPI values |
| `text-section` | 15 / 22 px, semibold | Panel titles (`h2`) |
| `text-body` | 14 / 20 px | Body, tables, controls |
| `text-caption` | 12 / 16 px | Helper text, metric labels, timestamps |

- Sentence case everywhere; no all-caps labels. Keep descriptions under ~70 characters per line (`max-w-[65ch]`).

### 3.3 Layout and spacing

- Desktop application shell with fixed/collapsible left sidebar and flexible main content.
- Use a consistent spacing scale based on 4px increments. *Implemented:* page gutters 16px mobile, 24px tablet, 32px desktop (`PageContainer`), max content width 1280px, 24px between sections and panels, 20px panel padding.
- Keep content aligned to a consistent page grid.
- Prefer whitespace and clear section separation over excessive card borders.
- Use moderate corner rounding and subtle shadows; avoid heavy glassmorphism everywhere.
- Use sticky page headers only where they improve navigation or context.

## 4. Application information architecture

Main navigation:

1. Overview
2. Documents
3. AI Assistant
4. Evaluation
5. Settings

The logo/product label appears at the top of the sidebar. A compact footer area can show a POC environment label and backend status.

### 4.1 Application shell

- Left sidebar: brand, primary navigation, environment/status indicator (backend `starting` / `healthy` / `degraded`), optional collapse control.
- Main area: page title, concise page description, contextual primary action, page content.
- Top-right area: no theme toggle in the MVP (dark mode is a stretch goal). Do not add a profile placeholder that implies real authentication. *Implemented:* a live backend indicator (click to re-check) and a "Local workspace" menu (states "single user, no sign-in"; links to Settings and the backend API reference) instead of a user profile. No global search is shown, because no search feature exists yet.
- **Mock-mode indicator:** when `VITE_API_MODE=mock`, show a persistent, clearly visible "Mock data — not connected to the backend" banner or badge on every page. It never appears in live mode. *Implemented:* a banner on every page ("Mock data, not connected to the backend. Documents, questions and metrics are demo fixtures. Backend status is still checked live.") plus a "Demo data" tag on each panel filled by the mock adapter. The health check stays real in both modes.
- Screens that are not built yet have working routes that show an honest "not built yet" page, so navigation never dead-ends.
- Main canvas should be responsive. On narrow screens, the sidebar becomes a drawer or compact navigation.

### 4.2 Status label mapping

Status values come from `docs/04-BACKEND-SCHEMA.md` §2. Labels always pair text with an icon and colour.

| Backend value | Badge label | Tone |
|---|---|---|
| Document `queued` | Queued | Neutral |
| Document `processing` + stage `text_extraction` | Extracting text | Info |
| Document `processing` + stage `chunking` | Preparing content | Info |
| Document `processing` + stage `embedding_generation` | Generating embeddings | Info |
| Document `processing` + stage `vector_indexing` | Indexing | Info |
| Document `completed` | Indexed | Success |
| Document `completed_with_warnings` | Indexed with warnings | Warning |
| Document `failed` | Failed | Danger |
| Document `needs_ocr` | Needs OCR (not supported) | Warning |
| Document `delete_failed` | Deletion incomplete | Danger |
| Query `insufficient_evidence` | Insufficient evidence | Warning |
| Query `completed` + `flag_for_review` | Answer — flagged for review | Warning |
| Evaluation `completed_with_errors` | Completed with errors | Warning |

Timeline stage states: pending, active, completed, completed with warning, failed, skipped. Each is visually distinct and labelled in text.

## 5. Screen-by-screen requirements

### Screen 1: Overview Dashboard (`/dashboard`)

**Purpose:** Give the user an at-a-glance view of the POC's current state.

**Content:**

- Page heading: "Overview" or "Workspace overview".
- Short supporting sentence describing the workspace.
- KPI cards: total documents, indexed documents (including "with warnings"), user queries run, median query latency (with sample count), latest evaluation run. Values come from `GET /dashboard/summary`; evaluation runs are not counted as queries. Use clearly marked demo fixtures only in mock mode.
- Recent documents table/list with filename, upload date, processing status, and page/chunk count if available (`GET /documents?page_size=5`).
- Recent query activity with question excerpt, status, and timestamp (`GET /queries?page_size=5`).
- Evaluation summary showing the latest run and a few measured metrics.
- Helpful empty state with a clear "Upload documents" action when the workspace is new.

**Interactions:** navigate to a document, open the assistant, start an upload, open an evaluation run.

*Implemented in Phase 2A:* greeting heading ("Good morning/afternoon/evening, welcome to EvidenceDesk AI", fallback "Welcome to EvidenceDesk AI"); a KPI ledger (one panel, four ruled columns: total documents, successfully processed with indexed share, total queries, **median** response time with sample count — the schema defines a median, not an average); recent documents table (name, type from file extension, upload date, status, pages); recent activity (uploads and questions merged, newest first); system status (backend health and document-processing activity from the real `GET /health`, AI service from `GET /settings/status`); quick actions (Upload documents, Open AI Assistant, View evaluation). In live mode, panels whose endpoints do not exist yet show "Not available yet". The latest-evaluation summary is deferred to the Evaluation screen phase; document rows are not links until a document detail view exists.

### Screen 2: Document Library (`/documents`)

**Purpose:** Upload, find, and manage the PDFs used by the assistant.

**Content:**

- Page title and "Upload documents" primary action.
- Large drag-and-drop upload region with browse fallback.
- Supported file note: text-based PDF; show the configured maximum file size.
- Upload queue: each selected file is uploaded as an independent request and shows its own result (accepted, invalid type, too large, duplicate, unparseable).
- Document table with filename, file size, pages, chunks, upload date, status badge (§4.2), and actions.
- Search by filename and filter by status. Document-type filtering is a stretch goal.
- Document detail drawer or page showing file metadata, file hash (truncated, copyable), page-level diagnostics (per-page character/token/chunk counts and warnings from `document_pages`), chunk count, and the processing timeline of the latest job (attempt number shown).

**Interactions:** upload one or more PDFs; inspect detail; **Reprocess** (creates a new job; available for indexed, failed, and needs-OCR documents); **Delete** with confirmation, explaining that past queries and evaluation results keep their snapshots. Reprocess and Delete are disabled with the backend-provided reason while a document is queued or processing. Upload, Reprocess, and Delete are all disabled with "Evaluation run in progress" while an evaluation is running (`activity.evaluation_active` from `GET /health`). Cancellation is not supported in the MVP and no cancel control is shown.

**States:** no documents, uploading, queued, processing, indexed, indexed with warnings, failed, needs OCR, duplicate detected (with link to the existing document), deletion incomplete, API unavailable.

### Screen 3: AI Assistant (`/assistant`)

**Purpose:** Let users ask questions over indexed documents and inspect the evidence behind answers.

**Layout:**

- Main question/answer area with a clear initial empty state and suggested example questions.
- A short note near the composer: "Each question is answered independently; earlier questions are not used as context." There is no conversation memory in the MVP.
- Message composer with submit button, disabled/loading state, and keyboard shortcut hint only if implemented.
- Query history list (from `GET /queries`) showing recent questions with status; selecting one reopens its stored result.
- Optional right-side evidence panel on wide screens; collapsible on narrow screens.
- Query-processing timeline shown while the backend is working.
- Answer area with readable paragraphs, lists, inline `[S1]` markers linked to their citation cards, and a clear insufficient-evidence state.
- **Cited sources:** compact source chips/cards with filename, page, and excerpt — only the sources the answer cited and the backend validated.
- **Retrieval details** (collapsible, separate from citations): every retrieved chunk in rank order with filename, page, raw distance (labelled "cosine distance — lower is closer"), passed-threshold indicator, and cited/not-cited indicator.
- "Flagged for review" warning when `flag_for_review` is true, with the review reasons in plain language.
- Notice when the evidence threshold is not yet calibrated.
- Sources from documents deleted later are marked "Document no longer available".
- Do not expose hidden model reasoning or private chain-of-thought.

**Query timeline stages** (backend stage names in `docs/04-BACKEND-SCHEMA.md` §2.6):

1. Question received (`query_received`).
2. Embedding the question (`query_embedding`).
3. Searching documents (`retrieval`).
4. Preparing supporting context (`context_preparation`).
5. Generating answer — Groq (`generation`; may be skipped).
6. Checking references (`citation_validation`; may be skipped).

These labels match `docs/05-APP-FLOW.md` §4.

Only show stages that are genuinely implemented and send actual backend events. A stage can also show failed or skipped; the terminal outcome can be answer ready, insufficient evidence, or failed.

**Interactions:** submit a question, inspect citations, open retrieval details, copy answer, give feedback, open source document details, reopen a past question from history, ask another question.

**States:** waiting for input, processing, answer ready, answer flagged for review, insufficient evidence, no indexed documents, provider error, timeout, interrupted, connection lost/reconnecting.

### Screen 4: Evaluation (`/evaluations`)

**Purpose:** Show how the application performs against a labelled test dataset.

**Content:**

- Evaluation page heading and explanation that results depend on the selected dataset and scoring method.
- Dataset selector showing dataset name, version, case count, and category breakdown.
- Corpus readiness: lists the documents referenced by the selected dataset and whether each is indexed. If any are missing, "Run evaluation" is disabled and the missing filenames are shown. Other uploaded documents do not affect readiness. While any document is processing, "Run evaluation" is disabled with "Wait for document processing to finish".
- "Run evaluation" action and running status/timeline (cases completed / total).
- Metric cards, grouped by method:
  - Rule-based: Precision@k, Recall@k, MRR (relevance = unique document/page), abstention correctness, citation source match, prompt-injection check.
  - Human-reviewed: answer correctness, faithfulness, citation validity — always with "reviewed X of Y".
  - Measured: median and p95 latency.
  Only display a metric when it has been calculated and has sufficient underlying data; otherwise show N/A with the reason.
- Run status including **Completed with errors**, with failed case counts split into infrastructure failures (excluded from quality metrics after all attempts fail) and pipeline failures. A case that is retrying shows "Retrying (attempt n of 3)".
- Charts: retrieval results by category, latency distribution, review rating distribution, and run-to-run comparison where multiple runs exist.
- Test-case table: case key, category, question, expected sources, retrieved sources, outcome, citation result, latency, execution status, and review status.
- Per-case detail view with expected answer and criteria, generated answer, abstention reason, review flag, cited sources, all retrieved excerpts, error (if failed), and the **review form**: correctness rating, faithfulness rating, citation validity, reviewer comment, optional reviewer initials. Saving calls `PUT /evaluations/results/{id}/review`.
- Clearly label rule-based, human-reviewed, measured, and (stretch) LLM-judge values separately.
- Evaluation runs do not appear in query history or dashboard query statistics.

**Important:** Do not display made-up percentages, fake benchmark numbers, or an aggregate "AI accuracy" score without a documented definition. Show sample count and evaluation run date.

### Screen 5: Settings (`/settings`)

**Purpose:** Display non-secret application configuration and health information.

**Content:**

- Application version / POC environment and API mode (live or mock).
- Backend health, vector store status (available, unavailable, model mismatch with reset guidance), embedding model name and dimension, and configured Groq model name.
- Configured upload limit, default and maximum retrieval top-k, and evidence threshold value or "Not yet calibrated" (from `GET /settings/status`).
- Short privacy note: use synthetic/public documents; uploaded files are stored locally in this POC.
- Theme preference is a stretch goal and is not shown in the MVP.

**Security:** never display the Groq API key, full `.env`, secret values, local absolute file paths, or stack traces.

## 6. Reusable component inventory

### Application foundation

- `AppShell`
- `SidebarNavigation`
- `PageHeader`
- `EnvironmentStatus`
- `MockModeBanner`
- `ResponsivePageContainer`
- `ThemeToggle` (stretch only)

### Data display

- `MetricCard`
- `StatusBadge`
- `DocumentTable`
- `RecentActivityList`
- `EmptyState`
- `ErrorState`
- `LoadingSkeleton`
- `DataFreshnessLabel`

### Document workflow

- `FileDropzone`
- `UploadQueue`
- `DocumentRow`
- `DocumentDetailPanel`
- `PageDiagnosticsTable`
- `ProcessingTimeline`
- `ProcessingStageItem`
- `DocumentActions` (reprocess / delete with disabled reasons)

### AI assistant

- `QuestionAnswerView`
- `AnswerMessage`
- `QuestionComposer`
- `QueryHistoryList`
- `QueryTimeline`
- `EvidencePanel`
- `CitationCard`
- `RetrievalDetails`
- `ReviewFlagNotice`
- `AnswerFeedback`
- `InsufficientEvidenceNotice`

### Evaluation

- `EvaluationRunControls`
- `EvaluationMetricCard`
- `EvaluationChart`
- `EvaluationCaseTable`
- `EvaluationCaseDetail`
- `EvaluationReviewForm`
- `CorpusReadinessList`
- `ScoringMethodLabel`

Use shadcn/ui as the base for dialogs, buttons, inputs, cards, tables, badges, tabs, tooltips, dropdowns, and sheets. Add React Bits components only when a specific component improves the experience. Do not install or use components solely because they look impressive.

## 7. Motion and animation specification

Use Motion for React (`motion` package; imports from `motion/react`). Motion should reinforce state and feedback, not compete with information.

| Interaction | Behaviour | Guidance |
|---|---|---|
| Page transition | Subtle fade with small vertical movement | Approximately 150–220 ms; avoid long transitions. |
| Sidebar active item | Smooth active indicator / background transition | Keep navigation responsive. |
| KPI value | Count-up only on first meaningful data load | Do not replay on every render. Respect reduced motion. |
| Card hover | Small elevation or border emphasis | No large scaling or bouncing. |
| Upload dropzone | Border/background response on drag-over | Clear visual feedback. |
| Upload progress | Real progress/status when available | Do not invent percentage progress if backend only sends stages. |
| Processing timeline | Stage indicator animates on backend event | Pending, active, completed, and failed states must be distinct. |
| Chat message | Gentle appearance transition | Avoid typing animation if it implies token streaming that is not implemented. |
| Citation panel | Smooth expand/collapse | Maintain keyboard and screen-reader usability. |
| Charts | Enter animation on initial load | Do not animate repeatedly on unrelated state updates. |
| Button | Subtle hover/tap feedback | Keep action clear and responsive. |
| Loading state | Skeleton or restrained spinner | Prefer skeletons for page content and small indicators for actions. |

### Implemented motion patterns (Phase 2A)

| Pattern | Implementation |
|---|---|
| Page transition | `pageVariants` in `src/lib/motion.ts`: fade + 6px rise, 200 ms, keyed by route. |
| Sidebar active item | Shared `layoutId` indicator with `springSnappy`; sidebar width animates 240 ↔ 64 px. |
| KPI appearance | One staggered reveal of the ledger cells; values count up once on first data (`useCountUp`). |
| Card hover | Only interactive cards (quick actions): border tint + raised shadow, no scaling. Static panels do not animate. |
| Button feedback | shadcn press offset; quick actions use `whileTap={{ scale: 0.99 }}`. |
| Dropdown / drawer | shadcn/Radix CSS enter/exit transitions (`tw-animate-css`, installed with shadcn), not a second JS library. |
| Loading → content | Skeletons while loading, then a 150 ms fade-in (`fadeInVariants`). |

Reduced motion: `MotionConfig reducedMotion="user"` at the root, a global CSS rule that shortens CSS animations and transitions, and `useCountUp` reads the media query synchronously so values never count up for those users.

### Motion constraints

- Respect `prefers-reduced-motion` globally.
- Do not animate every element on a page.
- Avoid perpetual shimmer/pulse outside a genuine active state.
- Avoid large parallax, excessive blur, cursor-following effects, and heavy 3D backgrounds.
- Keep animations smooth on ordinary laptops and mobile devices.
- Do not communicate success before the backend reports success.

## 8. Interaction and state design

Every data-dependent component must have the following relevant states:

- Initial / empty.
- Loading / in progress.
- Success / completed.
- Partial result / warning.
- Error / failed.
- Offline / reconnecting where relevant.

Forms should validate locally for immediate feedback and rely on backend validation for authoritative checks. Error messages should explain what happened and how the user can recover.

## 9. Responsive behaviour

| Viewport | Expected behaviour |
|---|---|
| Desktop (>= 1280px) | Full sidebar (240px, can be collapsed), multi-column dashboard, assistant with optional evidence side panel. |
| Laptop (1024–1279px) | Compact 64px icon rail with tooltips (can be expanded) and reduced dashboard columns. |
| Tablet (768–1023px) | Sidebar collapses to drawer; tables may use horizontal scroll or stacked rows. |
| Mobile (< 768px) | Drawer/bottom navigation, single-column content, full-width composer, evidence opens as a sheet. |

No text, status chip, chart, or action should clip outside its container.

## 10. Accessibility requirements

- Use semantic headings in logical order.
- Inputs must have visible/accessible labels.
- All controls must be keyboard accessible.
- Focus must be visible.
- Dialogs and sheets must manage focus correctly.
- Provide text labels for status and icons where needed.
- Meet WCAG AA contrast as a design target.
- Respect reduced-motion preference.
- Provide accessible chart labels or adjacent textual summaries.

## 11. Design implementation workflow for Claude Code

1. Read this brief before implementing any page.
2. Establish tokens, typography, layout, navigation, and reusable primitives first.
3. Build the application shell and confirm desktop/tablet/mobile behaviour.
4. Build one screen at a time using the same reusable components.
5. Use realistic mock data only through the explicit mock adapter (`VITE_API_MODE=mock`) with the mock-mode indicator visible, and only while API integration is pending.
6. Add Motion after the underlying interaction/state works.
7. Run the application and inspect each screen with Playwright.
8. Fix spacing, alignment, clipping, focus, responsiveness, and reduced-motion issues.
9. Re-test all loading, empty, success, and error states.

## 12. Visual quality acceptance checklist

- [ ] All five pages share the same visual system.
- [ ] Sidebar and page headers align consistently.
- [ ] Typography hierarchy is clear and readable.
- [ ] Tables, cards, badges, and dialogs use consistent styles.
- [ ] No content overflows or clips at supported widths.
- [ ] Every button and interactive element has a working action.
- [ ] Loading, empty, error, and success states are designed.
- [ ] Processing timelines reflect actual backend events.
- [ ] Citations are easy to find and inspect, and are visually separate from retrieval details.
- [ ] Evaluation metrics display their sample size and scoring method.
- [ ] The mock-mode indicator appears in mock mode only.
- [ ] No theme toggle, cancel control, or other unimplemented control is shown.
- [ ] Reduced-motion preference is honoured.
- [ ] Keyboard focus and labels are accessible.
- [ ] Browser testing and screenshots have been reviewed before a screen is marked complete.
