import { listBooks, getPage, getAllProgress, type Book } from "@/lib/db";
import ShelfRefresher from "./shelf-refresher";
import { BookShelf } from "./book-shelf";
import { BookTile } from "./book-tile";
import { EmptyShelf } from "./empty-shelf";
import { EditModeProvider } from "./edit-mode";
import { BottomBar } from "./bottom-bar";

export const dynamic = "force-dynamic";

// Read a ready book, review one that needs it, nothing to open while it's still
// queued/processing/errored.
function bookHref(book: Book): string | null {
  if (book.status === "ready") return `/book/${book.id}/read`;
  if (book.status === "review") return `/book/${book.id}/review`;
  return null;
}

// Light markdown strip for the coverless first-page preview; the cover's
// overflow-hidden clips whatever runs past the face.
const preview = (md: string): string =>
  md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\n{2,}/g, "\n\n")
    .trim();

export default async function Bookshelf() {
  const [books, progress] = await Promise.all([listBooks(), getAllProgress()]);

  const active = books.filter((b) => !b.archived);
  const reading = active.filter((b) => b.status === "ready");
  const needsReview = active.filter((b) => b.status !== "ready");
  const archived = books.filter((b) => !!b.archived);
  const busy = active.some((b) => b.status === "queued" || b.status === "processing");
  // Minimal per-book data the bottom bar's bulk actions need for the selection.
  const tileBooks = books.map((b) => ({
    id: b.id,
    title: b.title,
    archived: !!b.archived,
    ready: b.status === "ready",
    cover: b.cover_url,
  }));

  // First-page previews, only for the coverless ready books that render one.
  // ponytail: N+1 over those books; batch into one WHERE idx=0 query if it grows.
  const firstPages = new Map(
    await Promise.all(
      books
        .filter((b) => !b.cover_url && b.status === "ready")
        .map(async (b) => [b.id, preview((await getPage(b, 0)).markdown)] as const),
    ),
  );

  const tile = (book: Book, showStatus: boolean) => {
    const p = progress.get(book.id);
    return (
      <BookTile
        key={book.id}
        book={book}
        href={bookHref(book)}
        // Time tab once some reading has accrued; progress tab whenever the book
        // has been opened (a row exists), even at 0%.
        minutesRead={p && p.seconds > 0 ? p.seconds / 60 : undefined}
        fraction={p ? p.fraction : undefined}
        firstPage={firstPages.get(book.id) || undefined}
        showStatus={showStatus}
      />
    );
  };

  if (books.length === 0) return <EmptyShelf />;

  return (
    <EditModeProvider>
      {/* keeps the last row clear of the floating bottom bar. */}
      <div>
        {busy && <ShelfRefresher />}
        {reading.length > 0 && (
          <BookShelf title="Reading">
            {reading.map((b) => tile(b, false))}
          </BookShelf>
        )}
        {needsReview.length > 0 && (
          <BookShelf title={`Needs review (${needsReview.length})`}>
            {needsReview.map((b) => tile(b, true))}
          </BookShelf>
        )}
        {archived.length > 0 && (
          <BookShelf title="Archived">
            {archived.map((b) => tile(b, true))}
          </BookShelf>
        )}
      </div>
      <BottomBar books={tileBooks} />
    </EditModeProvider>
  );
}
