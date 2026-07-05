import Link from "next/link";
import { listBooks, type Book, type BookStatus } from "@/lib/db";
import ShelfRefresher from "./shelf-refresher";
import BookActions from "./book-actions";
import CombineForm from "./combine-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<BookStatus, string> = {
  queued: "Queued",
  processing: "Converting",
  review: "Needs review",
  ready: "Ready",
  error: "Failed",
};

const STATUS_CLASS: Record<BookStatus, string> = {
  queued: "bg-gray-200 text-gray-700",
  processing: "bg-blue-100 text-blue-700",
  review: "bg-amber-100 text-amber-800",
  ready: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
};

function bookHref(book: Book): string | null {
  if (book.status === "ready") return `/book/${book.id}/read`;
  if (book.status === "review") return `/book/${book.id}/review`;
  return null;
}

function Card({ book }: { book: Book }) {
  const href = bookHref(book);
  const progress =
    book.status === "processing" && book.page_count
      ? `${book.pages_done}/${book.page_count}`
      : null;

  const inner = (
    <>
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-gradient-to-br from-zinc-200 to-zinc-400 dark:from-zinc-700 dark:to-zinc-900">
        {book.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.cover_url}
            alt={book.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-4xl font-bold text-white/80">
            {book.title.charAt(0).toUpperCase()}
          </span>
        )}
        <span
          className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_CLASS[book.status]}`}
        >
          {STATUS_LABEL[book.status]}
          {progress ? ` ${progress}` : ""}
        </span>
      </div>
      <div className="mt-2">
        <p className="truncate text-sm font-medium">{book.title}</p>
        {book.author && (
          <p className="truncate text-xs text-zinc-500">{book.author}</p>
        )}
      </div>
    </>
  );

  return (
    <div>
      {href ? (
        <Link href={href} className="block transition hover:opacity-90">
          {inner}
        </Link>
      ) : (
        <div
          className={book.status === "error" ? "" : "opacity-80"}
          title={book.error ?? undefined}
        >
          {inner}
        </div>
      )}
      <BookActions id={book.id} status={book.status} />
    </div>
  );
}

function Section({ title, books }: { title: string; books: Book[] }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {title}{" "}
        <span className="font-normal normal-case">({books.length})</span>
      </h2>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
        {books.map((book) => (
          <Card key={book.id} book={book} />
        ))}
      </div>
    </section>
  );
}

export default async function Bookshelf() {
  const books = await listBooks();
  const busy = books.some(
    (b) => b.status === "queued" || b.status === "processing",
  );
  // Reading = finished books; everything else (queued, converting, review, error) needs attention.
  const reading = books.filter((b) => b.status === "ready");
  const needsReview = books.filter((b) => b.status !== "ready");
  const ready = reading.map((b) => ({ id: b.id, title: b.title }));

  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-medium">Your shelf is empty</p>
        <p className="mt-1 text-sm text-zinc-500">
          Upload a scanned PDF to turn it into a readable book.
        </p>
        <Link
          href="/upload"
          className="mt-6 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Upload your first book
        </Link>
      </div>
    );
  }

  return (
    <>
      {busy && <ShelfRefresher />}
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Bookshelf</h1>
        {ready.length >= 2 && <CombineForm books={ready} />}
      </div>
      {reading.length > 0 && <Section title="Reading" books={reading} />}
      {needsReview.length > 0 && (
        <Section title="Needs review" books={needsReview} />
      )}
    </>
  );
}
