# Third-Party Notices

EvidenceDesk AI is a local, non-distributed academic/interview proof of concept.
This file lists third-party licences that need attention. Full dependency pins:
`backend/requirements-lock.txt` and `frontend/package-lock.json`.

## PyMuPDF (backend)

- Packages: `pymupdf==2.1`, plus `pymupdf_layout==2.1` and `pymupdf4llm==2.1`
- Copyright: Artifex Software, Inc. — <https://www.artifex.com/>
- Licence: **Dual licensed — GNU Affero General Public License v3.0 (AGPL-3.0) or Artifex Commercial License**
- Licence notice shipped with the package: `pymupdf-2.1.dist-info/COPYING` in the backend virtual environment.
- This project uses PyMuPDF under **AGPL-3.0**. Distributing this software, or offering it to users over a
  network, requires meeting AGPL-3.0 obligations or a commercial licence from Artifex. Review before any such use.
- `pymupdf_layout` and `pymupdf4llm` 2.1 are empty compatibility packages (no code). Their former code now ships
  inside the `pymupdf` wheel and is covered by the same dual licence. See decision DD-32.

## React Bits (frontend, when components are added)

- Source: <https://reactbits.dev> — registry `@react-bits` in `frontend/components.json`
- Copyright (c) 2026 David Haz
- Licence: **MIT + Commons Clause**. Components may be used inside an application, including commercially, but
  the components themselves may not be sold, sublicensed or redistributed on their own.
- No React Bits components are installed yet. Only components without GSAP may be used (DD-31).
