"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type IsometricBookProps = {
  title: string;
  author?: string;
  /** Uploaded cover image. When absent, `firstPage` is shown straight instead. */
  coverUrl?: string;
  /** The book's first page, rendered on the front face when there's no cover. */
  firstPage?: React.ReactNode;
  /** Drives the spine thickness. */
  pageCount: number;
  /** Reading time → left bookmark tab; omit to hide it. */
  minutesRead?: number;
  /** Reading progress 0–1 → right bookmark tab; omit to hide it. */
  fraction?: number;
  /** Conversion status ("Queued" etc.) → white tab on the top edge; omit to hide it. */
  statusLabel?: string;
  /** Hold the book in its lifted/straightened hover pose (e.g. when selected). */
  active?: boolean;
  className?: string;
};

// Cover face size in px (1.6:1 aspect, sized so 6 fit a max-w-7xl shelf);
// thickness derives from the page count. Exported so a tile's footer (status,
// actions) can line up with the cover. COVER_H is only the coverless default —
// a real cover re-derives the height from its own aspect ratio.
export const COVER_W = 165;
const COVER_H = 264;
// The cover overhangs the page block by this much on the top, bottom, and
// fore-edge — like a hardcover's boards.
const OVERHANG = 2;

// ponytail: linear page-count → thickness, clamped so a 900-page tome stays a
// book, not a cinderblock. Tune the 0.18 if spines look off.
const depthFor = (pages: number) =>
  Math.round(Math.max(18, Math.min(130, pages * 0.18)));

// minutes → compact bookmark label ("45 m", "2 h", "2.1 h").
function formatDuration(min: number): string {
  if (min < 60) return `${Math.max(1, Math.round(min))} m`;
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

// fraction (0–1) → progress label. Treat ~all-read as done.
function formatProgress(f: number): string {
  if (f >= 0.995) return "Done";
  return `${Math.round(f * 100)}%`;
}

// Page-edge texture: repeating translucent lines over the paper colour, so they
// read as stacked pages on any PAGE_COLOR. Line thickness = period − gap (2px);
// widen the gap for fewer lines, or push the line stop for thinner ones.
const PAGE_COLOR = "#f5eeda"; //must be a CSS colour, not a class
const PAGE_LINE = "rgb(0 0 0 / 10%)";
const pageEdge = (deg: number) =>
  `repeating-linear-gradient(${deg}deg,transparent,transparent 6px,${PAGE_LINE} 6px,${PAGE_LINE} 8px)`;

export function IsometricBook({
  title,
  author,
  coverUrl,
  firstPage,
  pageCount,
  minutesRead,
  fraction,
  statusLabel,
  active,
  className,
}: IsometricBookProps) {
  const depth = depthFor(pageCount);

  // Height follows the cover's aspect ratio at fixed width, clamped between
  // square and 2:1 tall so an odd image can't wreck the shelf.
  const [h, setH] = useState(COVER_H);
  const measure = (img: HTMLImageElement) => {
    if (!img.naturalWidth) return;
    const ideal = (COVER_W * img.naturalHeight) / img.naturalWidth;
    setH(Math.round(Math.min(2 * COVER_W, Math.max(COVER_W, ideal))));
  };

  return (
    <figure className={cn("flex flex-col items-center gap-4", className)}>
      <div className="group relative perspective-distant">
        {/* The book. Gentle isometric tilt; straightens + lifts on hover, or
            held in that lifted pose when `active`. */}
        <div
          className={cn(
            "relative transform-3d rotate-x-3 transition-all duration-500 ease-out",
            active
              ? "-translate-y-2 -rotate-y-4"
              : "-rotate-y-12 group-hover:-translate-y-2 group-hover:-rotate-y-4",
          )}
          style={{ width: COVER_W, height: h }}
        >
          {/* Top page block (inset, so the cover overhangs it). */}
          <div
            aria-hidden
            className="absolute inset-0 m-auto"
            style={{
              width: COVER_W - 2 * OVERHANG,
              height: depth,
              transform: `rotateX(90deg) translateZ(${h / 2 - OVERHANG}px)`,
              backgroundColor: PAGE_COLOR,
              backgroundImage: pageEdge(0),
            }}
          />
          {/* Fore-edge page block (inset). */}
          <div
            aria-hidden
            className="absolute inset-0 m-auto"
            style={{
              width: depth,
              height: h - 2 * OVERHANG,
              transform: `rotateY(90deg) translateZ(${COVER_W / 2 - OVERHANG}px)`,
              backgroundColor: PAGE_COLOR,
              backgroundImage: pageEdge(90),
            }}
          />

          {/* Front cover — full size, so it overhangs the page block. */}
          <div
            className="absolute inset-0 m-auto rounded-l-sm rounded-r-md bg-white ring-1 ring-black/10"
            style={{
              width: COVER_W,
              height: h,
              transform: `translateZ(${depth / 2}px)`,
            }}
          >
            {/* Cover art, clipped to the rounded face. */}
            <div className="absolute inset-0 overflow-hidden rounded-l-sm rounded-r-md">
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  // Data-URI covers can finish loading before hydration wires
                  // onLoad, so measure from the ref too when already complete.
                  ref={(el) => {
                    if (el?.complete) measure(el);
                  }}
                  onLoad={(e) => measure(e.currentTarget)}
                  src={coverUrl}
                  alt={`${title} cover`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-white px-3 py-3 text-[6px] leading-snug text-zinc-800">
                  {firstPage ?? <span className="text-zinc-400">No cover</span>}
                </div>
              )}
              {/* Spine seam near the left edge. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-1.5 w-px bg-black/10"
              />
            </div>

            {/* Bookmark tabs hanging from the top edge, like real page markers:
                reading time (left) and reading progress (right), sitting together
                as a matched pair (a hairline seam keeps them legible as two). */}
            {(minutesRead != null || fraction != null || statusLabel) && (
              <div className="absolute -top-6 right-3 flex gap-1 leading-none">
                {statusLabel && (
                  <span className="rounded-t-sm bg-zinc-200 p-1 text-xs text-zinc-950">
                    {statusLabel}
                  </span>
                )}
                {minutesRead != null && (
                  <span className="rounded-t-sm bg-yellow-200 p-1 text-xs text-yellow-950">
                    {formatDuration(minutesRead)}
                  </span>
                )}
                {fraction != null && (
                  <span className="rounded-t-sm bg-yellow-200 p-1 text-xs text-yellow-950">
                    {formatProgress(fraction)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fixed height (fits a 2-line title + author) so every caption block
          matches: with the shelf grid's items-end, covers then share a common
          bottom line and titles a common top line. */}
      <figcaption className="h-16 text-left" style={{ width: COVER_W }}>
        <div className="line-clamp-2 text-sm leading-snug">
          {title}
        </div>
        {author && (
          <div className="line-clamp-1 text-sm text-muted-foreground">
            {author}
          </div>
        )}
      </figcaption>
    </figure>
  );
}
