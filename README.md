# Scanbook

Turn scanned PDF books into readable digital ones. Upload a scanned PDF →
[dots.mocr](https://huggingface.co/rednote-hilab/dots.mocr) OCRs it to markdown
(text, tables, math, **and figures**) → review/fix it in a WYSIWYG editor →
read it in the built-in reader. Single-user, no auth.

## Architecture

```
Browser ──upload PDF──▶ Vercel Blob
   └─create book──▶ Next API ──spawn──▶ Modal /convert
                                          │ (dots.mocr on an L4 GPU, scales to zero)
                                          ▼
                       PDF → page images → markdown (figures inline as base64)
                                          → writes status/progress/content to Turso
   Browser polls the DB ──▶ queued → processing → review → ready
```

- **Next.js 16** (App Router) — UI + API. Local dev DB is a libSQL file, so it
  runs with zero cloud setup.
- **Turso** (libSQL) — book metadata + converted markdown.
- **Vercel Blob** — uploaded PDFs (figures/cover are inline base64, not stored here).
- **Modal** — on-demand GPU batch OCR (`scanbook_modal.py`).

## Local development

```bash
npm install
npm run dev        # http://localhost:3000 — uses a local scanbook.db file
```

The upload + conversion flow needs the cloud services below; everything else
(shelf, editor, reader) works locally against the file DB.

## Deploy

### 1. Turso (database)

```bash
turso db create scanbook
turso db show scanbook --url          # -> TURSO_DATABASE_URL
turso db tokens create scanbook       # -> TURSO_AUTH_TOKEN
```
Tables are created automatically on first use.

### 2. Modal (OCR converter)

```bash
pip install modal
modal setup
modal secret create scanbook-turso \
  TURSO_DATABASE_URL=libsql://scanbook-you.turso.io \
  TURSO_AUTH_TOKEN=...
modal deploy scanbook_modal.py        # prints the convert_endpoint URL
```
First run downloads the model (~3B) into a cached volume; later runs are fast.
**Test it first on a 2–3 page PDF** before a whole book.

### 3. Vercel (web app)

Set these env vars (Vercel dashboard or `.env.local` for local prod):

| Var | From |
|-----|------|
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | step 1 |
| `BLOB_READ_WRITE_TOKEN` | Vercel → Storage → Blob |
| `MODAL_CONVERT_URL` | the `convert_endpoint` URL from step 2 |

```bash
vercel deploy
```

See `.env.example` for the full list.

## Notes / deferred

- Figures & cover are inline base64 in the markdown — simple and self-contained;
  swap to Blob if the DB rows get too large for heavily-illustrated books.
- Conversion runs pages sequentially for live progress. Raise throughput with
  dots.mocr's threaded `parse_pdf` path if books are large.
- No auth (single-user). The `books` table takes a `user_id` column cleanly if
  that changes.
