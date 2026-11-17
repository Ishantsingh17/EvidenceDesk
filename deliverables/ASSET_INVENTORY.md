# Deliverables: Asset Inventory

All assets were produced on 17 Nov 2026 from the running EvidenceDesk AI application in **live mode**: real FastAPI backend, real Groq model `openai/gpt-oss-20b`, and the 7 fictional PDFs in `sample-corpus/`. No mock data, stock images or illustrations are presented as screenshots.

## Documents

| File | Purpose |
|---|---|
| `EvidenceDeskAI_End_to_End_Walkthrough.pptx` | 18-slide 16:9 deck, editable shapes, speaker notes on every slide |
| `END_TO_END_WALKTHROUGH.md` | Full written walkthrough (18 sections) |
| `PRESENTER_GUIDE.md` | Per-slide script, follow-up Q&A, 2–3 min demo script, 5–7 min explanation |
| `ASSET_INVENTORY.md` | This file |

## Screenshots (`screenshots/`)

Captured with Playwright at a 1440 px wide browser window. "Crop" means a region of the same live screen; nothing was edited or added.

| File | Size (px) | What it shows | How captured | Used on slide |
|---|---|---|---|---|
| `01-overview.png` | 1440×900 | Overview dashboard: 7 documents, 11 questions, 821 ms median, health | Full window | 1 |
| `02-document-upload.png` | 1440×900 | Upload of `06-payment-approval-policy-v2.pdf` rejected as duplicate (HTTP 409) | Full window | 8 |
| `03-processing-timeline.png` | 576×285 | Real reprocess job: 5 stages with timings | Crop of document panel | 9 |
| `04-document-details.png` | 576×618 | Details: SHA-256, 2 pages, 4 chunks, page diagnostics | Crop of document panel | 10 |
| `05-query-processing.png` | 1440×900 | INR 250,000 question, answer and live query timeline | Full window | 11 |
| `06-answer-with-citations.png` | 771×1174 | Answer, S3 citation (v2 p.2), retrieval details with distances | Crop of answer card (tall window) | 12 |
| `07-insufficient-evidence.png` | 1440×900 | Wi-Fi question: insufficient evidence, Groq skipped | Full window | 13 |
| `08-evaluation-dashboard.png` | 1153×887 | Saved run summary and all metrics with sample counts | Crop of Evaluation page | 14 |
| `08b-evaluation-dataset.png` | 1440×900 | Dataset v1.1.0, 7 categories, corpus readiness | Full window | Guide only |
| `09a-case-detail.png` | 672×512 | AP-DIR-001: question, generated and expected answers | Crop of `09-human-review-full.png` | Guide only |
| `09-human-review.png` | 672×345 | Human review form with saved ratings | Crop of `09-human-review-full.png` | 15 |
| `09-human-review-full.png` | 672×1620 | Complete case panel incl. citations and review form | Panel at tall window | Guide only |
| `10-settings.png` | 1440×900 | Read-only settings; no secrets displayed | Full window | Guide only |

### Capture notes

- **Upload (02):** all 7 sample PDFs were already indexed, and deleting user data was not allowed, so the upload shows the real duplicate check. The processing timeline (03) is from a real **Reprocess** job on the same document, which runs the same pipeline.
- **Evaluation (08, 09):** the saved run from 17 Nov 2026 22:46 was used. No new 20-case run was started. The review on AP-DIR-001 is the one saved during earlier testing.
- **Questions asked during capture:** two new questions were added to the query history: the INR 250,000 question and the Wi-Fi question. One reprocess job was added for `06-payment-approval-policy-v2.pdf`. No documents or evaluation history were deleted.
- **Secrets:** the Settings page text was checked: no key appears. The deck text was scanned: no key pattern found.

## Evaluation values used (saved run, dataset `ap-policies` v1.1.0)

| Item | Value | Sample |
|---|---|---|
| Cases / completed / infrastructure / pipeline failures | 20 / 19 / 1 / 0 | — |
| Precision@4 / Recall@4 / MRR | 0.62 / 0.70 / 0.83 | 15 cases |
| Abstention correctness | 0.89 | 16 of 18 |
| Citation source match | 0.54 | 7 of 13 |
| Prompt-injection check | 1.00 | 3 of 3 |
| Human review (correctness / faithfulness / citation validity) | 1.00 / 1.00 / 1.00 | reviewed 1 of 19 |
| Latency median / p95 / mean | 9.42 s / 18.89 s / 8.09 s | 19 cases |

## How the deck was built

PptxGenJS 3.12 script, kept outside the repository so the app's dependencies are unchanged. It uses a theme with six section colours: indigo frontend, blue backend, teal embeddings and vector search, orange LLM, slate storage, magenta evaluation. The architecture diagram on slide 7 is made of native, editable PowerPoint shapes. The results chart on slide 15 is a native PowerPoint chart.

**Checks run:**

- the OOXML validator passed;
- the deck opened in Microsoft PowerPoint, and all 18 slides were exported and inspected visually;
- clipping and overlap defects were fixed.
