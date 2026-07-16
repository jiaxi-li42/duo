"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icon";
import { fileToCover } from "@/lib/cover";
import type { TileBook } from "./bottom-bar";

// The bottom bar's Combine button plus its dialog: pick the EN/ZH order, name
// the merged book, optionally replace the default (EN) cover, then kick off
// the merge job. `className` styles the trigger to match its siblings.
export function CombineDialog({
  chosen,
  className,
  onDone,
}: {
  chosen: TileBook[];
  className?: string;
  onDone: () => void;
}) {
  // Initial EN/ZH guess puts the CJK-titled book second; the swap button
  // corrects it. name === null means "still the auto default"; cover === null
  // means "still the EN book's cover".
  const [open, setOpen] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canCombine = chosen.length === 2 && chosen.every((b) => b.ready);
  const cjk = /[㐀-鿿]/;
  const [a, b] = chosen;
  const guess = canCombine && cjk.test(a.title) && !cjk.test(b.title) ? [b, a] : [a, b];
  const [en, zh] = swapped ? [guess[1], guess[0]] : guess;
  const defaultName = en ? `${en.title} (Bilingual)` : "";
  const coverSrc = cover ?? en?.cover;

  // Fresh form every time the dialog opens.
  const openChange = (next: boolean) => {
    if (next) {
      setSwapped(false);
      setName(null);
      setCover(null);
    }
    setOpen(next);
  };

  const combine = async () => {
    setBusy(true);
    await fetch("/api/books/combine", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enId: en.id,
        zhId: zh.id,
        title: (name ?? defaultName).trim() || defaultName,
        coverUrl: cover ?? undefined,
      }),
    });
    setBusy(false);
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger
        render={
          <Button
            variant="secondary"
            size="lg"
            className={className}
            disabled={!canCombine}
          />
        }
      >
        Combine
      </DialogTrigger>
      {canCombine && (
        <DialogContent className="gap-4 p-4 ring-0 rounded-4xl sm:max-w-md" showCloseButton={false}>
          <DialogHeader className="items-center text-center">
            <DialogTitle className="text-xl font-normal pt-2">
              Combine a bilingual book
            </DialogTitle>
            <DialogDescription>
              Select a book and its translation, and we&apos;ll automatically
              align the text for your review.
            </DialogDescription>
          </DialogHeader>

          {/* Cover: the EN book's until the user uploads their own. */}
          <div className="flex flex-col items-center">
            {coverSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverSrc}
                alt="Cover"
                className="h-40 w-auto rounded-sm object-cover ring-1 ring-foreground/10"
              />
            ) : (
              <div className="h-40 w-28 rounded-sm bg-muted" />
            )}
            <Button
              type="button"
              variant="link"
              className="text-foreground underline hover:text-muted-foreground"
              onClick={() => fileRef.current?.click()}
            >
              Upload cover
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setCover(await fileToCover(file));
                e.target.value = "";
              }}
            />
          </div>

          <Input
            aria-label="Name"
            // -mt-4 halves the grid's gap-8 for this one seam.
            className="rounded-none border-0 border-b px-0 focus-visible:ring-0 dark:bg-transparent"
            value={name ?? defaultName}
            onChange={(e) => setName(e.target.value)}
          />

          {/* min-w-0: as a grid item this row would otherwise refuse to shrink
              below the full nowrap title width, blowing the dialog open. */}
          <div className="flex min-w-0 items-center pt-4 gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              {(
                [
                  ["English", en],
                  ["Translation", zh],
                ] as const
              ).map(([label, book]) => (
                <div key={book.id} className="flex items-baseline gap-2">
                  <span className="w-20 shrink-0 text-muted-foreground">
                    {label}
                  </span>
                  <span className="truncate">{book.title}</span>
                </div>
              ))}
            </div>
            <Button
              variant="secondary"
              size="icon-lg"
              className="rounded-full"
              aria-label="Swap book order"
              onClick={() => setSwapped(!swapped)}
            >
              <Icon name="swap_vert" className="text-lg" />
            </Button>
          </div>

          <div className="flex justify-end gap-2 pt-6">
            <DialogClose
              render={<Button variant="outline" size="lg" className="rounded-full px-4" />}
            >
              Cancel
            </DialogClose>
            <Button
              size="lg"
              className="rounded-full px-4"
              onClick={combine}
              disabled={busy}
            >
              {busy ? "Combining…" : "Combine"}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
