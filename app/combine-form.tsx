"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; title: string };

// Pick an EN book + its ZH counterpart and merge them into one bilingual book.
export default function CombineForm({ books }: { books: Option[] }) {
  const router = useRouter();
  const [en, setEn] = useState("");
  const [zh, setZh] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function submit() {
    if (!en || !zh || en === zh || busy) return;
    setBusy(true);
    await fetch("/api/books/combine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enId: en, zhId: zh }),
    });
    setBusy(false);
    setOpen(false);
    setEn("");
    setZh("");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        Combine bilingual
      </button>
    );
  }

  const select =
    "rounded border border-black/15 bg-transparent px-2 py-1 text-sm dark:border-white/20";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-black/10 p-3 dark:border-white/15">
      <select value={en} onChange={(e) => setEn(e.target.value)} className={select}>
        <option value="">English book…</option>
        {books.map((b) => (
          <option key={b.id} value={b.id}>{b.title}</option>
        ))}
      </select>
      <span className="text-sm text-zinc-500">+</span>
      <select value={zh} onChange={(e) => setZh(e.target.value)} className={select}>
        <option value="">中文书…</option>
        {books.map((b) => (
          <option key={b.id} value={b.id}>{b.title}</option>
        ))}
      </select>
      <button
        onClick={submit}
        disabled={!en || !zh || en === zh || busy}
        className="rounded bg-foreground px-3 py-1 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40"
      >
        {busy ? "Starting…" : "Combine"}
      </button>
      <button
        onClick={() => setOpen(false)}
        className="rounded px-2 py-1 text-sm text-zinc-500 hover:underline"
      >
        Cancel
      </button>
    </div>
  );
}
