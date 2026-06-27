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
  source_pdf_url: string;
}): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO books (id, title, author, status, source_pdf_url, created_at, updated_at)
          VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
    args: [input.id, input.title, input.author ?? null, input.source_pdf_url, now, now],
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
