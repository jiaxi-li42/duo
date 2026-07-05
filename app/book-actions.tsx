"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BookStatus } from "@/lib/db";

export default function BookActions({
  id,
  status,
}: {
  id: string;
  status: BookStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    await fetch(`/api/books/${id}/retry`, { method: "POST" });
    router.refresh();
    setBusy(false);
  }

  async function remove() {
    if (!confirm("Delete this book? This can't be undone.")) return;
    setBusy(true);
    await fetch(`/api/books/${id}`, { method: "DELETE" });
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="mt-1 flex gap-2 text-xs">
      {status === "error" && (
        <button
          onClick={retry}
          disabled={busy}
          className="rounded border border-black/15 px-2 py-0.5 hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          Retry
        </button>
      )}
      <button
        onClick={remove}
        disabled={busy}
        className="rounded border border-red-300 px-2 py-0.5 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
      >
        Delete
      </button>
    </div>
  );
}
