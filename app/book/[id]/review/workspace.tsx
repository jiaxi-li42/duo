"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PageEditor from "./editor";

type PageData = { markdown: string; image: string | null };

// Paginated review: layout image (left) beside the page's Milkdown (right).
// Only the current page's text + image are loaded, so it scales to 300-page books.
export default function Workspace({
  id,
  total,
  initialPage,
  hasImages,
}: {
  id: string;
  total: number;
  initialPage: PageData;
  hasImages: boolean;
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [page, setPage] = useState<PageData>(initialPage);
  const [busy, setBusy] = useState(false);
  const getMd = useRef<() => string>(() => initialPage.markdown);

  async function saveCurrent() {
    await fetch(`/api/books/${id}/pages/${idx}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown: getMd.current() }),
    });
  }

  async function goto(target: number) {
    if (target < 0 || target >= total || target === idx || busy) return;
    setBusy(true);
    await saveCurrent();
    const res = await fetch(`/api/books/${id}/pages/${target}`);
    setPage(await res.json());
    setIdx(target);
    setBusy(false);
  }

  async function approve() {
    setBusy(true);
    await saveCurrent();
    await fetch(`/api/books/${id}/approve`, { method: "POST" });
    router.push(`/book/${id}/read`);
  }

  return (
    <div className="flex gap-4">
      {hasImages && (
        <div className="sticky top-4 hidden max-h-[85vh] w-1/2 shrink-0 self-start overflow-auto rounded-lg border border-black/10 bg-zinc-50 dark:border-white/15 dark:bg-zinc-900 lg:block">
          {page.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={page.image} alt={`Page ${idx + 1} layout`} className="w-full" />
          ) : (
            <p className="p-6 text-sm text-zinc-500">
              No layout preview for this page.
            </p>
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={() => goto(idx - 1)}
            disabled={busy || idx === 0}
            className="rounded border border-black/15 px-2 py-1 hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10"
          >
            ← Prev
          </button>
          <span className="flex items-center gap-1">
            Page
            <input
              key={idx}
              type="number"
              min={1}
              max={total}
              defaultValue={idx + 1}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  goto(Number(e.currentTarget.value) - 1);
              }}
              className="w-14 rounded border border-black/15 bg-transparent px-1 py-0.5 text-center dark:border-white/20"
            />
            / {total}
          </span>
          <button
            onClick={() => goto(idx + 1)}
            disabled={busy || idx === total - 1}
            className="rounded border border-black/15 px-2 py-1 hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10"
          >
            Next →
          </button>
          <button
            onClick={saveCurrent}
            disabled={busy}
            className="ml-auto rounded border border-black/15 px-3 py-1 font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
          >
            Save page
          </button>
          <button
            onClick={approve}
            disabled={busy}
            className="rounded bg-foreground px-3 py-1 font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            Approve &amp; add to shelf
          </button>
        </div>
        <PageEditor key={idx} markdown={page.markdown} getMarkdownRef={getMd} />
      </div>
    </div>
  );
}
