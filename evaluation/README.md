# Evaluation assets

- `datasets/ap-policies-v1.1.0.json` is the labelled 20-case evaluation dataset to load. It follows the seed format in `docs/04-BACKEND-SCHEMA.md` §8 and is validated against the real corpus by `backend/tests/test_evaluation_dataset.py`.
- `datasets/ap-policies-v1.0.0.json` is the original version, kept unchanged for history. It does not follow the schema format and is not loaded (decision DD-42 explains the field mapping and the behaviour changes).
- `HUMAN-REVIEW-GUIDE.md` defines human scoring and safe-behaviour review.
- `corpus-hashes.sha256` records SHA-256 hashes for the seven synthetic PDFs.

Ground-truth document identity uses SHA-256 file hashes rather than runtime database UUIDs. Relevant retrieval units are unique `(file_hash, page_number)` pairs with one-based page numbers. A dataset is immutable once published; create a new version for any change.

Check the datasets with: `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_evaluation_dataset.py` (from the project root, or `-m pytest tests\test_evaluation_dataset.py` from `backend/`).
