"use client";

import Link from "next/link";
import type { Book } from "@/lib/db";
import { cn } from "@/lib/utils";
import { IsometricBook, COVER_W } from "./isometric-book";
import { StatusCaption } from "./status-caption";
import { useEditMode } from "./edit-mode";

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
      active={isSelected}
    />
  );

  return (
    <div className="flex flex-col items-center gap-2">
      {editing ? (
        <button
          type="button"
          onClick={() => toggle(book.id)}
          aria-pressed={isSelected}
          className={cn(
            "block transition",
            // Selected → full colour + lifted pose (via IsometricBook active);
            // otherwise greyed and dimmed until hovered.
            !isSelected && "opacity-50 grayscale hover:opacity-90",
          )}
        >
          {visual}
        </button>
      ) : href ? (
        <Link href={href} className="block">
          {visual}
        </Link>
      ) : (
        visual
      )}
      {showStatus && (
        <div style={{ width: COVER_W }}>
          <StatusCaption status={book.status} />
        </div>
      )}
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
