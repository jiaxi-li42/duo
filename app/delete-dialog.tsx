"use client";

import { useState } from "react";
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
import { Icon } from "@/components/icon";
import type { TileBook } from "./bottom-bar";

// The bottom bar's Delete button plus its confirmation dialog (replaces the
// old native confirm()).
export function DeleteDialog({
  chosen,
  onDone,
}: {
  chosen: TileBook[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const count = chosen.length;

  const remove = async () => {
    setBusy(true);
    await Promise.all(
      chosen.map((b) => fetch(`/api/books/${b.id}`, { method: "DELETE" })),
    );
    setBusy(false);
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="destructive"
            size="icon-lg"
            className="rounded-full"
            aria-label={`Delete ${count} selected`}
            disabled={count === 0}
          />
        }
      >
        <Icon name="scan_delete" fill className="text-lg" />
      </DialogTrigger>
      <DialogContent className="gap-8 p-4 ring-0 rounded-4xl sm:max-w-sm" showCloseButton={false}>
        <DialogHeader className="items-center text-center">
          <DialogTitle className="pt-2 text-xl font-normal">
            Delete {count} book{count === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            The book{count === 1 ? " and its" : "s and their"} scans will be
            permanently removed. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <DialogClose
            render={<Button variant="outline" size="lg" className="rounded-full px-4" />}
          >
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            size="lg"
            className="rounded-full px-4"
            onClick={remove}
            disabled={busy}
          >
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
