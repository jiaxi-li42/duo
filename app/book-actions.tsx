"use client";

import { useRouter } from "next/navigation";
import type { BookStatus } from "@/lib/db";
import { Button } from "@/components/ui/button";

// Delete (all states) + Retry (failed only).
// ponytail: dropped the auto-spinner the Astryx Button had — these calls are
// quick and single-user; router.refresh() reflects the result.
export default function BookActions({
  id,
  status,
}: {
  id: string;
  status: BookStatus;
}) {
  const router = useRouter();

  async function retry() {
    await fetch(`/api/books/${id}/retry`, { method: "POST" });
    router.refresh();
  }

  async function remove() {
    if (!confirm("Delete this book? This can't be undone.")) return;
    await fetch(`/api/books/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      {status === "error" && (
        <Button variant="outline" size="sm" onClick={retry}>
          Retry
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={remove}>
        Delete
      </Button>
    </div>
  );
}
