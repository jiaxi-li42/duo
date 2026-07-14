"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Menu,
  Minus,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type TocItem = { index: number; id: string; text: string; level: number };
export type Highlight = { cfi: string; color: string; text?: string };

// Highlight swatches — bright enough to read over text on both light and dark.
const HIGHLIGHT_COLORS = ["#ffd54a", "#8ce99a", "#74c0fc", "#faa2c1"];

// Draw callback handed to foliate's overlay (see overlayer.js / view.js
// draw-annotation). Mirrors Overlayer.highlight: a <g> of translucent <rect>s,
// one per client rect of the selection range. Built with the top document like
// overlayer.js does; foliate adopts it into the section iframe on attach.
const SVGNS = "http://www.w3.org/2000/svg";
function drawHighlight(
  rects: Iterable<DOMRect>,
  options: { color?: string } = {},
) {
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("fill", options.color ?? HIGHLIGHT_COLORS[0]);
  g.style.opacity = "var(--overlayer-highlight-opacity, .35)";
  for (const { left, top, height, width } of rects) {
    const el = document.createElementNS(SVGNS, "rect");
    el.setAttribute("x", String(left));
    el.setAttribute("y", String(top));
    el.setAttribute("width", String(width));
    el.setAttribute("height", String(height));
    g.append(el);
  }
  return g;
}

// Selection/annotation range → viewport point above its top edge, so the
// popover can float over it. The range lives inside a section iframe, so add
// the iframe's own offset in the top document.
function anchorPoint(range: Range): { x: number; y: number } {
  const rect = range.getBoundingClientRect();
  const frame = (
    range.startContainer.ownerDocument?.defaultView as Window & {
      frameElement?: Element | null;
    }
  )?.frameElement?.getBoundingClientRect();
  const ox = frame?.left ?? 0;
  const oy = frame?.top ?? 0;
  return { x: ox + rect.left + rect.width / 2, y: oy + rect.top };
}

type PopoverState =
  | { mode: "new"; cfi: string; text: string; x: number; y: number }
  | { mode: "edit"; cfi: string; x: number; y: number };

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
@font-face{font-family:"Louize";src:url("/fonts/LouizeTrial-Regular.otf") format("opentype");font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"Louize";src:url("/fonts/LouizeTrial-Italic.otf") format("opentype");font-weight:400;font-style:italic;font-display:swap}
@font-face{font-family:"Louize";src:url("/fonts/LouizeTrial-Medium.otf") format("opentype");font-weight:500;font-style:normal;font-display:swap}
@font-face{font-family:"Louize";src:url("/fonts/LouizeTrial-Bold.otf") format("opentype");font-weight:700;font-style:normal;font-display:swap}
html,body{margin:0;padding:0}
:root{color-scheme:light dark}
body{font-family:"Louize",Georgia,"Times New Roman",serif;color:#1a1a1a}
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

// Flat chapter list. foliate drives the active highlight via the relocate event,
// so this is a plain controlled list — no scroll-spy of its own.
function Toc({
  items,
  activeHref,
  onPick,
}: {
  items: TocItem[];
  activeHref: string | null;
  onPick: (href: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((t) => {
        const href = hrefOf(t);
        return (
          <li key={href}>
            <button
              onClick={() => onPick(href)}
              style={{ paddingLeft: `${(t.level - 1) * 12 + 8}px` }}
              className={cn(
                "block w-full truncate rounded-md py-1 pr-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                activeHref === href
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground",
              )}
            >
              {t.text}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function Reader({
  id,
  sections,
  toc,
  initialCFI,
  initialHighlights,
}: {
  id: string;
  sections: string[];
  toc: TocItem[];
  initialCFI: string | null;
  initialHighlights: Highlight[];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView>(null);
  const lastCfi = useRef<string | null>(initialCFI);
  // Latest reading fraction + reading time not yet flushed to the server.
  const lastFraction = useRef(0);
  const pendingMs = useRef(0);
  const activeStart = useRef(0);
  const navBusy = useRef(false);
  const navNext = useRef<number | null>(null);
  // cfi -> color for every drawn highlight; re-added whenever a section's
  // overlay is (re)created, so highlights survive navigating away and back.
  const highlights = useRef<Map<string, string>>(new Map());
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [fraction, setFraction] = useState(0);
  const [flow, setFlow] = useState<"paginated" | "scrolled">("paginated");
  const [fontPct, setFontPct] = useState(100);
  const [activeHref, setActiveHref] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Build the view once per book. sections/toc/initialCFI are stable per page load.
  useEffect(() => {
    let cancelled = false;
    let view: FoliateView = null;
    const urls: string[] = [];

    highlights.current = new Map(initialHighlights.map((h) => [h.cfi, h.color]));

    // Bank the time since we last looked, but only while the tab is visible — so
    // a book left open in a background tab or another window doesn't rack up hours.
    const accrue = () => {
      if (document.visibilityState === "visible")
        pendingMs.current += Date.now() - activeStart.current;
      activeStart.current = Date.now();
    };

    // Persist resume point + fraction + the whole seconds accrued since the last
    // send (added to the running total server-side). Beacon on unload; keepalive
    // fetch on the interval.
    const save = (beacon: boolean) => {
      accrue();
      const seconds = Math.floor(pendingMs.current / 1000);
      pendingMs.current -= seconds * 1000;
      if (!lastCfi.current && seconds === 0) return;
      const body = JSON.stringify({
        position: lastCfi.current,
        fraction: lastFraction.current,
        seconds,
      });
      if (beacon) {
        navigator.sendBeacon?.(
          `/api/books/${id}/progress`,
          new Blob([body], { type: "application/json" }),
        );
      } else {
        fetch(`/api/books/${id}/progress`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
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
      view.addEventListener("relocate", (e: CustomEvent) => {
        const f = Number.isFinite(e.detail.fraction) ? e.detail.fraction : 0;
        setFraction(f);
        lastFraction.current = f;
        lastCfi.current = e.detail.cfi ?? lastCfi.current;
        setActiveHref(e.detail.tocItem?.href ?? null);
        setPopover(null); // page turned — drop any open selection popover
      });

      // Highlights, via foliate's overlay plumbing (overlayer.js):
      // - draw-annotation: how each highlight is painted (our SVG rects).
      // - create-overlay: fires when a section's overlay (re)mounts — re-add
      //   every stored highlight so they persist across navigation.
      // - show-annotation: user clicked an existing highlight → offer removal.
      view.addEventListener("draw-annotation", (e: CustomEvent) => {
        const { draw, annotation } = e.detail;
        draw(drawHighlight, { color: annotation.color });
      });
      view.addEventListener("create-overlay", () => {
        for (const [cfi, color] of highlights.current)
          view.addAnnotation({ value: cfi, color });
      });
      view.addEventListener("show-annotation", (e: CustomEvent) => {
        const { x, y } = anchorPoint(e.detail.range);
        setPopover({ mode: "edit", cfi: e.detail.value, x, y });
      });

      view.addEventListener("load", (e: CustomEvent) => {
        const { doc, index } = e.detail;
        doc.addEventListener("keydown", onKey);
        // Surface the "highlight this" popover when a text selection settles.
        doc.addEventListener("pointerup", () => {
          const sel = doc.getSelection();
          if (!sel || sel.isCollapsed || !sel.rangeCount) {
            setPopover((p) => (p?.mode === "new" ? null : p));
            return;
          }
          const range = sel.getRangeAt(0);
          const text = sel.toString().trim();
          if (!text) return;
          const { x, y } = anchorPoint(range);
          setPopover({ mode: "new", cfi: view.getCFI(index, range), text, x, y });
        });
      });

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

    activeStart.current = Date.now();
    const onVis = () => accrue(); // bank/rebase the reading clock on every flip
    const beacon = () => save(true);
    const tick = setInterval(() => save(false), 20000);

    const ready = setup().catch(console.error);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pagehide", beacon);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      save(true);
      clearInterval(tick);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pagehide", beacon);
      document.removeEventListener("visibilitychange", onVis);
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

  const goToHref = (href: string) => {
    viewRef.current?.goTo?.(href);
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

  // Live scrub: navigate on every drag tick, but never run two goToFractions at
  // once — overlapping calls raced foliate's section load/destroy cycle
  // (createTreeWalker/unobserve on a torn-down doc). Serialize by coalescing to
  // the latest requested fraction while one navigation is in flight.
  const scrub = (v: number) => {
    navNext.current = v;
    if (navBusy.current) return;
    navBusy.current = true;
    (async () => {
      while (navNext.current !== null) {
        const target = navNext.current;
        navNext.current = null;
        try {
          await viewRef.current?.goToFraction?.(target);
        } catch {
          /* section swapped mid-nav; next loop iteration corrects it */
        }
      }
      navBusy.current = false;
    })();
  };

  const applyHighlight = (color: string) => {
    if (popover?.mode !== "new") return;
    const { cfi, text } = popover;
    highlights.current.set(cfi, color);
    viewRef.current?.addAnnotation?.({ value: cfi, color });
    viewRef.current?.deselect?.();
    setPopover(null);
    fetch(`/api/books/${id}/highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cfi, color, text }),
    }).catch(() => {});
  };

  const removeHighlight = () => {
    if (!popover) return;
    const { cfi } = popover;
    highlights.current.delete(cfi);
    viewRef.current?.deleteAnnotation?.({ value: cfi });
    setPopover(null);
    fetch(`/api/books/${id}/highlights`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cfi }),
    }).catch(() => {});
  };

  const tocNode = <Toc items={toc} activeHref={activeHref} onPick={goToHref} />;

  return (
    <div className="flex gap-6">
      {popover && (
        <div
          className="fixed z-50 -translate-x-1/2 -translate-y-full"
          style={{ left: popover.x, top: popover.y - 8 }}
        >
          <div className="flex items-center gap-1 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
            {popover.mode === "new" ? (
              HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Highlight ${c}`}
                  onClick={() => applyHighlight(c)}
                  className="size-6 rounded-full border border-black/10 transition hover:scale-110"
                  style={{ background: c }}
                />
              ))
            ) : (
              <Button variant="ghost" size="sm" onClick={removeHighlight}>
                <Trash2 className="size-3.5" />
                Remove
              </Button>
            )}
          </div>
        </div>
      )}

      {toc.length > 0 && (
        <nav className="sticky top-8 hidden max-h-[calc(100dvh-13rem)] w-56 shrink-0 self-start overflow-auto lg:block">
          {tocNode}
        </nav>
      )}

      <div className="min-w-0 flex-1">
        <div
          className="relative overflow-hidden rounded-lg border bg-background"
          style={{ height: "calc(100dvh - 13rem)" }}
        >
          {/* foliate mounts here; React never touches this node's children */}
          <div ref={hostRef} className="absolute inset-0" />

          <div className="absolute inset-y-0 left-0 z-10 flex items-center pl-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous page"
              onClick={() => viewRef.current?.goLeft?.()}
            >
              <ChevronLeft />
            </Button>
          </div>
          <div className="absolute inset-y-0 right-0 z-10 flex items-center pr-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next page"
              onClick={() => viewRef.current?.goRight?.()}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          {toc.length > 0 && (
            <span className="lg:hidden">
              <Popover open={tocOpen} onOpenChange={setTocOpen}>
                <PopoverTrigger
                  render={
                    <Button variant="ghost" size="icon" aria-label="Contents" />
                  }
                >
                  <Menu />
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="start"
                  className="max-h-80 w-64 overflow-auto"
                >
                  {tocNode}
                </PopoverContent>
              </Popover>
            </span>
          )}

          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Reading settings"
                />
              }
            >
              <Settings2 />
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-60">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Font size
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Decrease font size"
                    onClick={() => setFont(-10)}
                  >
                    <Minus />
                  </Button>
                  <span className="text-sm tabular-nums">{fontPct}%</span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Increase font size"
                    onClick={() => setFont(10)}
                  >
                    <Plus />
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Layout
                </span>
                {/* ponytail: two buttons instead of a segmented control — Base UI's
                    ToggleGroup is multi-select, so single-choice is less code here. */}
                <div className="flex rounded-lg border p-0.5">
                  {(["paginated", "scrolled"] as const).map((mode) => (
                    <Button
                      key={mode}
                      variant={flow === mode ? "secondary" : "ghost"}
                      size="sm"
                      className="flex-1 capitalize"
                      onClick={() => setFlowMode(mode)}
                    >
                      {mode}
                    </Button>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <span className="min-w-0 flex-1">
            <Slider
              aria-label="Reading position"
              min={0}
              max={1}
              step={0.0001}
              value={[fraction]}
              // Live page updates while dragging; scrub() serializes the calls
              // so they never overlap (see its comment).
              onValueChange={(v) => {
                const n = Array.isArray(v) ? v[0] : v;
                setFraction(n);
                scrub(n);
              }}
            />
          </span>

          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {Math.round(fraction * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
