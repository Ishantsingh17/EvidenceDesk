# Evaluation assets

- `datasets/ap-policies-v1.0.0.json` is the labelled 20-case evaluation dataset.
- `HUMAN-REVIEW-GUIDE.md` defines human scoring and safe-behaviour review.
- `corpus-hashes.sha256` records SHA-256 hashes for the seven synthetic PDFs.

Ground-truth document identity uses SHA-256 file hashes rather than runtime database UUIDs. Relevant retrieval units are unique `(file_hash, page_number)` pairs. The dataset is immutable after a run is recorded; create a new version for changes.
