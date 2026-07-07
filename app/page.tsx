import { listBooks, type Book, type BookStatus } from "@/lib/db";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import ShelfRefresher from "./shelf-refresher";
import BookActions from "./book-actions";
import CombineForm from "./combine-form";

export const dynamic = "force-dynamic";

// Status → a coloured dot + label (never colour alone).
const STATUS: Record<
  BookStatus,
  { color: string; label: string; pulse?: boolean }
> = {
  queued: { color: "bg-zinc-400", label: "Queued" },
  processing: { color: "bg-blue-500", label: "Converting", pulse: true },
  review: { color: "bg-amber-500", label: "Needs review" },
  ready: { color: "bg-green-500", label: "Ready" },
  error: { color: "bg-red-500", label: "Failed" },
};

function bookHref(book: Book): string | null {
  if (book.status === "ready") return `/book/${book.id}/read`;
  if (book.status === "review") return `/book/${book.id}/review`;
  return null;
}

function BookCard({ book }: { book: Book }) {
  const href = bookHref(book);
  const s = STATUS[book.status];
  const progress =
    book.status === "processing" && book.page_count
      ? ` ${book.pages_done}/${book.page_count}`
      : "";

  const card = (
    <Card
      className={cn(
        "gap-2 p-3",
        href && "transition-colors hover:bg-accent",
        book.status === "error" && "border-destructive/50",
      )}
    >
      {/* ponytail: 3/4 cover image stays a plain Tailwind aspect box — no shadcn
          component models a cover, and CSS does it in one class. */}
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
      </div>
      <div className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn("size-2 rounded-full", s.color, s.pulse && "animate-pulse")}
          />
          {s.label}
          {progress}
        </span>
        <span className="text-sm font-medium">{book.title}</span>
        {book.author && (
          <span className="text-xs text-muted-foreground">{book.author}</span>
        )}
      </div>
    </Card>
  );

  return (
    <div className="flex flex-col gap-1">
      {href ? (
        <Link href={href} className="block">
          {card}
        </Link>
      ) : (
        card
      )}
      <BookActions id={book.id} status={book.status} />
    </div>
  );
}

function Section({ title, books }: { title: string; books: Book[] }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <Badge variant="secondary">{books.length}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {books.map((book) => (
          <BookCard key={book.id} book={book} />
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
  const reading = books.filter((b) => b.status === "ready");
  const needsReview = books.filter((b) => b.status !== "ready");
  const ready = reading.map((b) => ({ id: b.id, title: b.title }));

  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <h2 className="text-xl font-semibold">Your shelf is empty</h2>
        <p className="text-muted-foreground">
          Upload a scanned PDF to turn it into a readable book.
        </p>
        <Link
          href="/upload"
          className="font-medium text-primary underline underline-offset-4"
        >
          Upload your first book
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {busy && <ShelfRefresher />}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">Bookshelf</h2>
        {ready.length >= 2 && <CombineForm books={ready} />}
      </div>
      {reading.length > 0 && <Section title="Reading" books={reading} />}
      {needsReview.length > 0 && (
        <Section title="Needs review" books={needsReview} />
      )}
    </div>
  );
}
