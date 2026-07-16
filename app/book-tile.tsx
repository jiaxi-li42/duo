"use client";

import Link from "next/link";
import type { Book, BookStatus } from "@/lib/db";
import { cn } from "@/lib/utils";
import { IsometricBook } from "./isometric-book";
import { useEditMode } from "./edit-mode";

// Only the three states worth surfacing; ready/review show nothing (implied by
// the shelf). Rendered as a white tab on the book's top edge.
const STATUS_LABEL: Partial<Record<BookStatus, string>> = {
  queued: "Queued",
  processing: "Processing",
  error: "Failed",
};

// One shelf entry: the 3D book linked to its reader/review page. In edit mode it
// stops being a link and becomes a selection toggle — greyed out until picked,
// then full-colour in the lifted hover pose.
export function BookTile({
  book,
  href,
  minutesRead,
  fraction,
  firstPage,
  showStatus,
}: {
  book: Book;
  href: string | null;
  /** Reading-time bookmark; omit to hide. */
  minutesRead?: number;
  /** Progress bookmark 0–1; omit to hide. */
  fraction?: number;
  /** First-page preview text for a coverless book; falls back to the initial. */
  firstPage?: string;
  /** Show the status caption (skipped on the plain "Reading" shelf). */
  showStatus?: boolean;
}) {
  const { editing, selected, toggle } = useEditMode();
  const isSelected = selected.has(book.id);

  // The front face shows: the cover, else a first-page preview, else the initial.
  const front = book.cover_url ? undefined : firstPage ? (
    <div className="whitespace-pre-line">{firstPage}</div>
  ) : (
    <Initial title={book.title} />
  );

  const visual = (
    <IsometricBook
      title={book.title}
      author={book.author ?? undefined}
      coverUrl={book.cover_url ?? undefined}
      firstPage={front}
      pageCount={book.page_count ?? 0}
      minutesRead={minutesRead}
      fraction={fraction}
      statusLabel={showStatus ? STATUS_LABEL[book.status] : undefined}
      active={isSelected}
    />
  );

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Grey-out lives on this wrapper (persists across renders, so the fade
          animates both in and out of edit mode). Selected → full colour +
          lifted pose (via IsometricBook active); otherwise greyed and dimmed
          until hovered. */}
      <div
        className={cn(
          "transition",
          editing && !isSelected && "opacity-50 grayscale hover:opacity-90",
        )}
      >
        {href ? (
          // One element for both modes: swapping button↔Link would remount the
          // 3D book and snap its pose transitions (e.g. a selected book
          // dropping back on Done). In edit mode the link turns into a
          // selection toggle instead.
          <Link
            href={href}
            className="block"
            role={editing ? "button" : undefined}
            aria-pressed={editing ? isSelected : undefined}
            onClick={
              editing
                ? (e) => {
                    e.preventDefault();
                    toggle(book.id);
                  }
                : undefined
            }
          >
            {visual}
          </Link>
        ) : (
          // No reader page to link to (still converting/errored) — one
          // persistent button in both modes (disabled outside edit) so the
          // mode switch doesn't remount the book, which would reset its
          // measured cover height and make it visibly jump.
          <button
            type="button"
            className="block"
            disabled={!editing}
            aria-pressed={editing ? isSelected : undefined}
            onClick={editing ? () => toggle(book.id) : undefined}
          >
            {visual}
          </button>
        )}
      </div>
    </div>
  );
}

// Big first letter, for a book with neither a cover nor readable first page.
function Initial({ title }: { title: string }) {
  return (
    <span className="flex h-full items-center justify-center text-4xl font-bold text-zinc-300">
      {title.charAt(0).toUpperCase()}
    </span>
  );
}
