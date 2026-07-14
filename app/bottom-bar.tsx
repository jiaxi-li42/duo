"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { useEditMode } from "./edit-mode";

export type TileBook = {
  id: string;
  title: string;
  archived: boolean;
  ready: boolean;
};

// Pill-shaped override on the shadcn secondary buttons. Translucent fill so the
// bar's glass shows through; no per-button backdrop-blur — the bar already
// blurs, and nesting filters costs an extra compositing pass for nothing.
const PILL = "rounded-full px-4 bg-secondary/60";

// Floating action bar, centred at the bottom.
//   normal: ＋ (upload) and Edit
//   edit:   Archive · Combine · Delete (on the selection) and Done
export function BottomBar({ books }: { books: TileBook[] }) {
  const { editing, setEditing, selected, clear } = useEditMode();
  const router = useRouter();

  const chosen = books.filter((b) => selected.has(b.id));
  const count = chosen.length;
  const allArchived = count > 0 && chosen.every((b) => b.archived);
  const canCombine = count === 2 && chosen.every((b) => b.ready);

  // Swap modes inside a view transition so the pill expands/contracts between
  // its two button sets (tuned in globals.css); instant where unsupported.
  const switchMode = (next: boolean) => {
    if (!document.startViewTransition) return setEditing(next);
    document.startViewTransition(() => flushSync(() => setEditing(next)));
  };

  const done = () => {
    clear();
    router.refresh();
  };

  const setArchived = async (value: boolean) => {
    await Promise.all(
      chosen.map((b) =>
        fetch(`/api/books/${b.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ archived: value }),
        }),
      ),
    );
    done();
  };

  const remove = async () => {
    if (!confirm(`Delete ${count} book${count > 1 ? "s" : ""}? This can't be undone.`))
      return;
    await Promise.all(
      chosen.map((b) => fetch(`/api/books/${b.id}`, { method: "DELETE" })),
    );
    done();
  };

  const combine = async () => {
    if (!canCombine) return;
    // The book whose title has CJK characters is the ZH source; the other is EN
    // (its title becomes the merged book's base name). Fall back to selection
    // order when it's ambiguous.
    const cjk = /[㐀-鿿]/;
    const [a, b] = chosen;
    const enId = cjk.test(a.title) && !cjk.test(b.title) ? b.id : a.id;
    const zhId = enId === a.id ? b.id : a.id;
    await fetch("/api/books/combine", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enId, zhId }),
    });
    done();
  };

  return (
    <div className="fixed inset-x-0 bottom-8 z-30 flex justify-center px-4">
      {/* Liquid-glass pill wrapping the action buttons (see .liquid-glass).
          The view-transition-name is what lets the pill morph on mode switch. */}
      <div className="liquid-glass flex items-center gap-1 rounded-full p-1 [view-transition-name:bottom-bar]">
        {editing ? (
          <>
            <Button
              variant="secondary"
              size="lg"
              className={PILL}
              disabled={count === 0}
              onClick={() => setArchived(!allArchived)}
            >
              {allArchived ? "Unarchive" : "Archive"}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className={PILL}
              disabled={!canCombine}
              onClick={combine}
            >
              Combine
            </Button>
            <Button
              variant="destructive"
              size="icon-lg"
              className="rounded-full"
              aria-label={`Delete ${count} selected`}
              disabled={count === 0}
              onClick={remove}
            >
              <Icon name="scan_delete" fill className="text-lg" />
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className={PILL}
              onClick={() => switchMode(false)}
            >
              Done
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              size="icon-lg"
              className={PILL}
              nativeButton={false}
              render={
                <Link href="/upload" aria-label="Upload PDF">
                  <Icon name="add" className="text-lg" />
                </Link>
              }
            />
            <Button
              variant="secondary"
              size="lg"
              className={PILL}
              onClick={() => switchMode(true)}
            >
              Edit
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
