"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageEditor from "./editor";

type PageData = { markdown: string; image: string | null };

// Paginated review: layout image (left) beside the page's editor (right).
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
  const [jump, setJump] = useState("1");
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
    setJump(String(target + 1)); // keep the page field in sync with the current page
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
        // ponytail: layout-scan image panel stays Tailwind — it's an image
        // container with no shadcn equivalent (like the shelf cover).
        <div className="sticky top-4 hidden max-h-[85vh] w-1/2 shrink-0 self-start overflow-auto rounded-lg border bg-muted/40 lg:block">
          {page.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={page.image} alt={`Page ${idx + 1} layout`} className="w-full" />
          ) : (
            <p className="p-6 text-muted-foreground">
              No layout preview for this page.
            </p>
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy || idx === 0}
            onClick={() => goto(idx - 1)}
          >
            ← Prev
          </Button>
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            Page
            <Input
              aria-label="Go to page"
              type="number"
              inputMode="numeric"
              min={1}
              max={total}
              value={jump}
              onChange={(e) => setJump(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") goto(Number(jump) - 1);
              }}
              className="h-7 w-16"
            />
            / {total}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || idx === total - 1}
            onClick={() => goto(idx + 1)}
          >
            Next →
          </Button>
          <span className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={saveCurrent}
            >
              Save page
            </Button>
            <Button size="sm" disabled={busy} onClick={approve}>
              Approve &amp; add to shelf
            </Button>
          </span>
        </div>
        <PageEditor key={idx} markdown={page.markdown} getMarkdownRef={getMd} />
      </div>
    </div>
  );
}
