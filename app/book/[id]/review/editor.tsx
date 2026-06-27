"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

export default function Editor({ id, initial }: { id: string; initial: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const router = useRouter();

  useEffect(() => {
    let destroyed = false;
    let crepe: Crepe | null = null;
    (async () => {
      if (!rootRef.current) return;
      crepe = new Crepe({ root: rootRef.current, defaultValue: initial });
      await crepe.create();
      if (destroyed) return crepe.destroy();
      crepeRef.current = crepe;
    })();
    return () => {
      destroyed = true;
      crepeRef.current?.destroy();
      crepeRef.current = null;
    };
  }, [initial]);

  async function save(markReady: boolean) {
    const content = crepeRef.current?.getMarkdown() ?? "";
    setSaving("saving");
    await fetch(`/api/books/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(markReady ? { content, status: "ready" } : { content }),
    });
    setSaving("saved");
    if (markReady) router.push(`/book/${id}/read`);
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => save(false)}
          disabled={saving === "saving"}
          className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          Save draft
        </button>
        <button
          onClick={() => save(true)}
          disabled={saving === "saving"}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          Approve &amp; add to shelf
        </button>
        {saving === "saved" && (
          <span className="text-sm text-green-600">Saved</span>
        )}
      </div>
      <div
        ref={rootRef}
        className="rounded-lg border border-black/10 dark:border-white/15"
      />
    </div>
  );
}
