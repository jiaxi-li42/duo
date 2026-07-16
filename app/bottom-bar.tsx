"use client";

import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { CombineDialog } from "./combine-dialog";
import { DeleteDialog } from "./delete-dialog";
import { UploadDialog } from "./upload-dialog";
import { useEditMode } from "./edit-mode";

export type TileBook = {
  id: string;
  title: string;
  archived: boolean;
  ready: boolean;
  cover: string | null;
};

// Pill-shaped override on the shadcn secondary buttons. Translucent fill so the
// bar's glass shows through; no per-button backdrop-blur — the bar already
// blurs, and nesting filters costs an extra compositing pass for nothing.
const PILL = "rounded-full px-4 bg-secondary/60";

// Floating action bar, centred at the bottom.
//   normal: ＋ (upload) and Edit
//   edit:   Archive · Combine · Delete (on the selection) and Done
export function BottomBar({ books }: { books: TileBook[] }) {
  const { editing, setEditing, selected } = useEditMode();
  const router = useRouter();

  const chosen = books.filter((b) => selected.has(b.id));
  const count = chosen.length;
  const allArchived = count > 0 && chosen.every((b) => b.archived);

  // Swap modes inside a view transition so the pill expands/contracts between
  // its two button sets (tuned in globals.css); instant where unsupported.
  const switchMode = (next: boolean) => {
    if (!document.startViewTransition) return setEditing(next);
    document.startViewTransition(() => flushSync(() => setEditing(next)));
  };

  // Bulk actions land here: back to the normal bar (leaving edit mode also
  // drops the selection in the provider) and refresh the shelf data.
  const done = () => {
    switchMode(false);
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
            <CombineDialog chosen={chosen} className={PILL} onDone={done} />
            <DeleteDialog chosen={chosen} onDone={done} />
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
            <UploadDialog
              trigger={
                <Button
                  variant="secondary"
                  size="icon-lg"
                  className={PILL}
                  aria-label="Upload a book"
                />
              }
            >
              <Icon name="add" className="text-lg" />
            </UploadDialog>
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
