import { createClient, type Client } from "@libsql/client";

// Defaults to a local libSQL file so the app runs with zero setup.
// Set TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) to point at remote Turso.
export const db: Client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "file:scanbook.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export type BookStatus =
  | "queued"
  | "processing"
  | "review"
  | "ready"
  | "error";

export interface Book {
  id: string;
  title: string;
  author: string | null;
  status: BookStatus;
  page_count: number | null;
  pages_done: number;
  content: string | null;
  cover_url: string | null;
  source_pdf_url: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

let schemaReady: Promise<void> | null = null;

// Idempotent; memoized so it runs once per server process.
export function ensureSchema(): Promise<void> {
  schemaReady ??= db.batch(
    [
      `CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        page_count INTEGER,
        pages_done INTEGER NOT NULL DEFAULT 0,
        content TEXT,
        cover_url TEXT,
        source_pdf_url TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS reading_progress (
        book_id TEXT PRIMARY KEY,
        position TEXT,
        updated_at INTEGER NOT NULL
      )`,
      // Per-page rows for the side-by-side review workspace. layout_image is a
      // downscaled base64 data URI of the boxed layout viz, cleared on approve.
      `CREATE TABLE IF NOT EXISTS pages (
        book_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        markdown TEXT,
        layout_image TEXT,
        PRIMARY KEY (book_id, idx)
      )`,
      // Reader highlights. cfi is foliate's EpubCFI for the selected range and
      // doubles as the row key (unique per selection); text is the excerpt.
      `CREATE TABLE IF NOT EXISTS highlights (
        book_id TEXT NOT NULL,
        cfi TEXT NOT NULL,
        color TEXT NOT NULL,
        text TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (book_id, cfi)
      )`,
    ],
    "write",
  ).then(() => {});
  return schemaReady;
}

export async function listBooks(): Promise<Book[]> {
  await ensureSchema();
  const { rows } = await db.execute(
    "SELECT * FROM books ORDER BY created_at DESC",
  );
  return rows as unknown as Book[];
}

export async function getBook(id: string): Promise<Book | null> {
  await ensureSchema();
  const { rows } = await db.execute({
    sql: "SELECT * FROM books WHERE id = ?",
    args: [id],
  });
  return (rows[0] as unknown as Book) ?? null;
}

export async function createBook(input: {
  id: string;
  title: string;
  author?: string | null;
  source_pdf_url?: string | null; // null for books assembled in-app (e.g. bilingual merges)
}): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO books (id, title, author, status, source_pdf_url, created_at, updated_at)
          VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
    args: [input.id, input.title, input.author ?? null, input.source_pdf_url ?? null, now, now],
  });
}

const UPDATABLE = new Set([
  "title",
  "author",
  "status",
  "page_count",
  "pages_done",
  "content",
  "cover_url",
  "error",
]);

export async function updateBook(
  id: string,
  fields: Partial<Book>,
): Promise<void> {
  await ensureSchema();
  const keys = Object.keys(fields).filter((k) => UPDATABLE.has(k));
  if (keys.length === 0) return;
  const set = keys.map((k) => `${k} = ?`).join(", ");
  const args = keys.map((k) => (fields as Record<string, unknown>)[k] as never);
  await db.execute({
    sql: `UPDATE books SET ${set}, updated_at = ? WHERE id = ?`,
    args: [...args, Date.now(), id],
  });
}

export async function getProgress(bookId: string): Promise<string | null> {
  await ensureSchema();
  const { rows } = await db.execute({
    sql: "SELECT position FROM reading_progress WHERE book_id = ?",
    args: [bookId],
  });
  return (rows[0]?.position as string | undefined) ?? null;
}

export async function setProgress(bookId: string, position: string): Promise<void> {
  await ensureSchema();
  await db.execute({
    sql: `INSERT INTO reading_progress (book_id, position, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(book_id) DO UPDATE SET position = excluded.position, updated_at = excluded.updated_at`,
    args: [bookId, position, Date.now()],
  });
}

export async function deleteBook(id: string): Promise<void> {
  await ensureSchema();
  await db.batch(
    [
      { sql: "DELETE FROM books WHERE id = ?", args: [id] },
      { sql: "DELETE FROM reading_progress WHERE book_id = ?", args: [id] },
      { sql: "DELETE FROM pages WHERE book_id = ?", args: [id] },
      { sql: "DELETE FROM highlights WHERE book_id = ?", args: [id] },
    ],
    "write",
  );
}

// --- Reader highlights ---

export interface Highlight {
  cfi: string;
  color: string;
  text: string;
}

export async function listHighlights(bookId: string): Promise<Highlight[]> {
  await ensureSchema();
  const { rows } = await db.execute({
    sql: "SELECT cfi, color, text FROM highlights WHERE book_id = ? ORDER BY created_at",
    args: [bookId],
  });
  return rows.map((r) => ({
    cfi: r.cfi as string,
    color: r.color as string,
    text: (r.text as string | null) ?? "",
  }));
}

export async function addHighlight(
  bookId: string,
  cfi: string,
  color: string,
  text: string,
): Promise<void> {
  await ensureSchema();
  await db.execute({
    sql: `INSERT INTO highlights (book_id, cfi, color, text, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(book_id, cfi) DO UPDATE SET color = excluded.color`,
    args: [bookId, cfi, color, text, Date.now()],
  });
}

export async function deleteHighlight(bookId: string, cfi: string): Promise<void> {
  await ensureSchema();
  await db.execute({
    sql: "DELETE FROM highlights WHERE book_id = ? AND cfi = ?",
    args: [bookId, cfi],
  });
}

// --- Per-page review data ---

export interface PageMeta {
  idx: number;
  hasImage: boolean;
}

// Light list for navigation: page indices + whether a layout image exists.
// Falls back to a single synthetic page for books converted before paging.
export async function listPages(book: Book): Promise<PageMeta[]> {
  await ensureSchema();
  const { rows } = await db.execute({
    sql: "SELECT idx, (layout_image IS NOT NULL) AS has_image FROM pages WHERE book_id = ? ORDER BY idx",
    args: [book.id],
  });
  if (rows.length === 0) {
    return book.content != null ? [{ idx: 0, hasImage: false }] : [];
  }
  return rows.map((r) => ({ idx: Number(r.idx), hasImage: !!Number(r.has_image) }));
}

// All page markdowns in order, for the reader. One string per section.
// Legacy books (no page rows) fall back to the single joined `content` field.
export async function getPageMarkdowns(book: Book): Promise<string[]> {
  await ensureSchema();
  const { rows } = await db.execute({
    sql: "SELECT markdown FROM pages WHERE book_id = ? ORDER BY idx",
    args: [book.id],
  });
  if (rows.length === 0) return book.content != null ? [book.content] : [];
  return rows.map((r) => (r.markdown as string | null) ?? "");
}

export async function getPage(
  book: Book,
  idx: number,
): Promise<{ markdown: string; image: string | null }> {
  await ensureSchema();
  const { rows } = await db.execute({
    sql: "SELECT markdown, layout_image FROM pages WHERE book_id = ? AND idx = ?",
    args: [book.id, idx],
  });
  if (rows.length === 0) {
    // Legacy book with no page rows: serve whole content as page 0.
    return { markdown: idx === 0 ? (book.content ?? "") : "", image: null };
  }
  return {
    markdown: (rows[0].markdown as string | null) ?? "",
    image: (rows[0].layout_image as string | null) ?? null,
  };
}

export async function savePage(
  bookId: string,
  idx: number,
  markdown: string,
): Promise<void> {
  await ensureSchema();
  await db.execute({
    sql: `INSERT INTO pages (book_id, idx, markdown) VALUES (?, ?, ?)
          ON CONFLICT(book_id, idx) DO UPDATE SET markdown = excluded.markdown`,
    args: [bookId, idx, markdown],
  });
}

// Join edited pages into the reader's single markdown field, drop the now-unneeded
// layout images, and mark the book ready.
export async function approveBook(bookId: string): Promise<void> {
  await ensureSchema();
  const { rows } = await db.execute({
    sql: "SELECT markdown FROM pages WHERE book_id = ? ORDER BY idx",
    args: [bookId],
  });
  const fields: Partial<Book> = { status: "ready" };
  if (rows.length > 0) {
    fields.content = rows
      .map((r) => (r.markdown as string | null) ?? "")
      .join("\n\n---\n\n");
  }
  await updateBook(bookId, fields);
  await db.execute({
    sql: "UPDATE pages SET layout_image = NULL WHERE book_id = ?",
    args: [bookId],
  });
}
