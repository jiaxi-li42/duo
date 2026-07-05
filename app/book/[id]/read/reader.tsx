"use client";

import { useEffect, useRef, useState } from "react";

export type TocItem = { index: number; id: string; text: string; level: number };

// Minimal book object foliate's <foliate-view> understands (see foliate-js
// view.js / paginator.js). We feed it our own HTML sections instead of an EPUB.
type FoliateSection = {
  id: number;
  linear: string;
  size: number;
  load: () => string;
  unload: () => void;
  createDocument: () => Document;
};

const hrefOf = (item: TocItem) => `${item.index}#${item.id}`;

// Structural styling baked into each section's iframe document. The *tunable*
// bits (font scale, justification) live in readingCSS below and are pushed live
// via renderer.setStyles, so they change without rebuilding the blob docs.
const SECTION_CSS = `
html,body{margin:0;padding:0}
:root{color-scheme:light dark}
body{font-family:Georgia,"Times New Roman",serif;color:#1a1a1a}
@media (prefers-color-scheme:dark){body{color:#c9c9c9}}
p{margin:0 0 1em}
h1,h2,h3,h4{line-height:1.25;margin:1.4em 0 .6em;font-weight:600}
h1{font-size:1.6em}h2{font-size:1.35em}h3{font-size:1.15em}
img{max-width:100%;height:auto;display:block;margin:1em auto}
blockquote{margin:1em 0;padding-left:1em;border-left:3px solid currentColor;opacity:.85}
pre{white-space:pre-wrap;overflow-wrap:break-word;background:rgba(127,127,127,.12);padding:.75em;border-radius:6px;font-size:.9em}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}
table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.95em}
th,td{border:1px solid rgba(127,127,127,.4);padding:.4em .6em;text-align:left}
a{color:inherit;text-underline-offset:2px}
hr{border:none;border-top:1px solid rgba(127,127,127,.4);margin:2em 0}
`;

// Live-adjustable typography (adapted from foliate-js reader.js getCSS): font
// scale via the root font-size %, plus justified text with hyphenation.
const readingCSS = (fontPct: number) => `
html{font-size:${fontPct}%}
body{font-size:1.05rem;line-height:1.6}
p,li,blockquote,dd{text-align:justify;-webkit-hyphens:auto;hyphens:auto;hanging-punctuation:allow-end;widows:2}
`;

const wrapDoc = (fragment: string) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<link rel="stylesheet" href="/katex/katex.min.css">` +
  `<style>${SECTION_CSS}</style></head><body>${fragment}</body></html>`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FoliateView = any;

export default function Reader({
  id,
  sections,
  toc,
  initialCFI,
}: {
  id: string;
  sections: string[];
  toc: TocItem[];
  initialCFI: string | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView>(null);
  const tocNavRef = useRef<HTMLElement>(null);
  const lastCfi = useRef<string | null>(initialCFI);
  const [fraction, setFraction] = useState(0);
  const [flow, setFlow] = useState<"paginated" | "scrolled">("paginated");
  const [fontPct, setFontPct] = useState(100);
  const [activeHref, setActiveHref] = useState<string | null>(null);
  const [ticks, setTicks] = useState<number[]>([]);
  const [tocOpen, setTocOpen] = useState(false);

  // Build the view once per book. sections/toc/initialCFI are stable per page load.
  useEffect(() => {
    let cancelled = false;
    let view: FoliateView = null;
    const urls: string[] = [];

    const flush = () => {
      if (lastCfi.current) {
        navigator.sendBeacon?.(
          `/api/books/${id}/progress`,
          new Blob([JSON.stringify({ position: lastCfi.current })], {
            type: "application/json",
          }),
        );
      }
    };

    const book = {
      dir: "ltr",
      metadata: { title: "" },
      rendition: { layout: "reflowable" },
      // Real TOC (label + href) so foliate reports the current chapter in the
      // relocate event (detail.tocItem) — used to highlight the active entry.
      toc: toc.map((t) => ({ label: t.text, href: hrefOf(t) })),
      sections: sections.map((frag, i): FoliateSection => {
        let url: string | null = null;
        return {
          id: i,
          linear: "yes",
          // Weight progress by visible text, not bytes — otherwise a cover page
          // with base64 images (huge markup, little text) hijacks the bar.
          size: Math.max(1, frag.replace(/<[^>]+>/g, "").length),
          load: () => {
            url = URL.createObjectURL(
              new Blob([wrapDoc(frag)], { type: "text/html" }),
            );
            urls.push(url);
            return url;
          },
          unload: () => {
            if (url) URL.revokeObjectURL(url);
            url = null;
          },
          createDocument: () =>
            new DOMParser().parseFromString(wrapDoc(frag), "text/html"),
        };
      }),
      // hrefs are "<sectionIndex>" or "<sectionIndex>#<elementId>"
      resolveHref: (href: string) => {
        const [i, anchorId] = String(href).split("#");
        return {
          index: Number(i),
          anchor: anchorId
            ? (doc: Document) => doc.getElementById(anchorId)
            : undefined,
        };
      },
      splitTOCHref: (href: string) => {
        const [i, anchorId] = String(href).split("#");
        return [Number(i), anchorId];
      },
      getTOCFragment: (doc: Document, anchorId: string) =>
        doc.getElementById(anchorId),
      isExternal: (href: string) => /^(https?|mailto):/i.test(href),
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") viewRef.current?.goRight?.();
      else if (e.key === "ArrowLeft") viewRef.current?.goLeft?.();
    };

    const setup = async () => {
      // Load foliate as a plain ES module (it defines <foliate-view> on eval).
      // Kept out of the bundler on purpose — it's vendored ESM in /public.
      if (!customElements.get("foliate-view")) {
        await new Promise<void>((res, rej) => {
          const s = document.createElement("script");
          s.type = "module";
          s.src = "/foliate-js/view.js";
          s.onload = () => res();
          s.onerror = () => rej(new Error("Failed to load foliate-js"));
          document.head.append(s);
        });
      }
      await customElements.whenDefined("foliate-view");
      if (cancelled || !hostRef.current) return;

      view = document.createElement("foliate-view");
      viewRef.current = view;
      view.style.width = "100%";
      view.style.height = "100%";
      hostRef.current.append(view);

      await view.open(book);
      if (cancelled) return;

      view.renderer.setAttribute("flow", flow);
      view.renderer.setStyles?.(readingCSS(fontPct));
      setTicks(view.getSectionFractions?.() ?? []);
      view.addEventListener("relocate", (e: CustomEvent) => {
        setFraction(Number.isFinite(e.detail.fraction) ? e.detail.fraction : 0);
        lastCfi.current = e.detail.cfi ?? lastCfi.current;
        setActiveHref(e.detail.tocItem?.href ?? null);
      });
      view.addEventListener("load", (e: CustomEvent) =>
        e.detail.doc.addEventListener("keydown", onKey),
      );

      if (initialCFI) {
        try {
          await view.goTo(initialCFI);
        } catch {
          await view.renderer.next();
        }
      } else {
        await view.renderer.next();
      }
    };

    const ready = setup().catch(console.error);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pagehide", flush);

    return () => {
      cancelled = true;
      flush();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pagehide", flush);
      // Tear down only after setup() settles — never close a view whose open()
      // or goTo() is still in flight (dev StrictMode double-mount / fast unmount),
      // which would leave observers running on a detached iframe document.
      ready.finally(() => {
        try {
          view?.close?.();
          view?.remove?.();
        } catch {
          /* ignore */
        }
        urls.forEach(URL.revokeObjectURL);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Keep the active chapter scrolled into view in the sidebar (from tree.js).
  useEffect(() => {
    if (!activeHref) return;
    tocNavRef.current
      ?.querySelector(`[data-href="${CSS.escape(activeHref)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeHref]);

  const goToItem = (item: TocItem) => {
    viewRef.current?.goTo?.(hrefOf(item));
    setTocOpen(false);
  };

  const setFont = (delta: number) => {
    setFontPct((v) => {
      const n = Math.min(180, Math.max(70, v + delta));
      viewRef.current?.renderer?.setStyles?.(readingCSS(n));
      return n;
    });
  };

  const setFlowMode = (mode: "paginated" | "scrolled") => {
    setFlow(mode);
    viewRef.current?.renderer?.setAttribute("flow", mode);
  };

  const tocList = (items: TocItem[]) => (
    <ul className="space-y-1">
      {items.map((h, i) => {
        const active = hrefOf(h) === activeHref;
        return (
          <li key={i} style={{ paddingLeft: (h.level - 1) * 12 }}>
            <button
              data-href={hrefOf(h)}
              aria-current={active ? "true" : undefined}
              onClick={() => goToItem(h)}
              className={`block w-full truncate text-left hover:text-foreground ${
                active
                  ? "font-medium text-foreground"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {h.text}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex gap-6">
      {toc.length > 0 && (
        <nav
          ref={tocNavRef}
          className="sticky top-8 hidden max-h-[calc(100dvh-13rem)] w-56 shrink-0 self-start overflow-auto text-sm lg:block"
        >
          <p className="mb-2 font-semibold text-zinc-500">Contents</p>
          {tocList(toc)}
        </nav>
      )}

      <div className="min-w-0 flex-1">
        <div
          className="relative overflow-hidden rounded-lg border border-black/10 bg-white dark:border-white/15 dark:bg-zinc-950"
          style={{ height: "calc(100dvh - 13rem)" }}
        >
          {/* foliate mounts here; React never touches this node's children */}
          <div ref={hostRef} className="absolute inset-0" />

          <button
            aria-label="Previous page"
            onClick={() => viewRef.current?.goLeft?.()}
            className="absolute inset-y-0 left-0 z-10 flex w-10 items-center justify-center text-zinc-400 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
          >
            ‹
          </button>
          <button
            aria-label="Next page"
            onClick={() => viewRef.current?.goRight?.()}
            className="absolute inset-y-0 right-0 z-10 flex w-10 items-center justify-center text-zinc-400 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
          >
            ›
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3 text-sm">
          {toc.length > 0 && (
            <button
              onClick={() => setTocOpen((v) => !v)}
              className="rounded border border-black/15 px-2 py-1 hover:bg-black/5 lg:hidden dark:border-white/20 dark:hover:bg-white/10"
            >
              Contents
            </button>
          )}

          {/* Settings menu (font size + layout), inspired by foliate-js menu.js.
              <details> gives native toggle + keyboard a11y with no extra state. */}
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center rounded border border-black/15 px-2 py-1 hover:bg-black/5 [&::-webkit-details-marker]:hidden dark:border-white/20 dark:hover:bg-white/10">
              <span className="font-serif">
                A<span className="text-xs">a</span>
              </span>
            </summary>
            <div className="absolute bottom-full left-0 z-20 mb-1 w-52 rounded-lg border border-black/10 bg-white p-3 shadow-lg dark:border-white/15 dark:bg-zinc-900">
              <p className="mb-1 text-xs font-medium text-zinc-500">Font size</p>
              <div className="mb-3 flex items-center gap-2">
                <button
                  onClick={() => setFont(-10)}
                  className="h-7 w-8 rounded border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                >
                  A−
                </button>
                <span className="flex-1 text-center tabular-nums text-zinc-500">
                  {fontPct}%
                </span>
                <button
                  onClick={() => setFont(10)}
                  className="h-7 w-8 rounded border border-black/15 text-base hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                >
                  A+
                </button>
              </div>
              <p className="mb-1 text-xs font-medium text-zinc-500">Layout</p>
              <div className="flex gap-1">
                {(["paginated", "scrolled"] as const).map((mode) => (
                  <button
                    key={mode}
                    aria-pressed={flow === mode}
                    onClick={() => setFlowMode(mode)}
                    className={`flex-1 rounded border px-2 py-1 capitalize ${
                      flow === mode
                        ? "border-foreground bg-foreground text-background"
                        : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </details>

          <input
            type="range"
            list="section-ticks"
            min={0}
            max={1}
            step={0.0001}
            value={fraction}
            onChange={(e) =>
              viewRef.current?.goToFraction?.(parseFloat(e.target.value))
            }
            className="min-w-0 flex-1 accent-foreground"
            aria-label="Reading position"
          />
          <datalist id="section-ticks">
            {ticks.map((f, i) => (
              <option key={i} value={f} />
            ))}
          </datalist>
          <span className="w-10 shrink-0 text-right tabular-nums text-zinc-500">
            {Math.round(fraction * 100)}%
          </span>
        </div>

        {tocOpen && toc.length > 0 && (
          <nav className="mt-3 max-h-64 overflow-auto rounded-lg border border-black/10 p-3 text-sm lg:hidden dark:border-white/15">
            {tocList(toc)}
          </nav>
        )}
      </div>
    </div>
  );
}
