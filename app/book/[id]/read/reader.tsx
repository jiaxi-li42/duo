"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import "katex/dist/katex.min.css";

type Heading = { id: string; text: string; level: number };

export default function Reader({
  id,
  content,
  initialPosition,
}: {
  id: string;
  content: string;
  initialPosition: number;
}) {
  const articleRef = useRef<HTMLElement>(null);
  const [toc, setToc] = useState<Heading[]>([]);

  // Build the TOC from rendered headings, and restore reading position.
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    const heads = Array.from(el.querySelectorAll("h1, h2, h3")) as HTMLElement[];
    setToc(
      heads.map((h) => ({
        id: h.id,
        text: h.textContent ?? "",
        level: Number(h.tagName[1]),
      })),
    );
    if (initialPosition > 0) window.scrollTo(0, initialPosition);
  }, [content, initialPosition]);

  // Save scroll position (debounced) and on leave.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const save = () => {
      navigator.sendBeacon?.(
        `/api/books/${id}/progress`,
        new Blob([JSON.stringify({ position: window.scrollY })], {
          type: "application/json",
        }),
      );
    };
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(save, 800);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("beforeunload", save);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("beforeunload", save);
      save();
    };
  }, [id]);

  return (
    <div className="flex gap-8">
      {toc.length > 0 && (
        <nav className="sticky top-8 hidden max-h-[80vh] w-56 shrink-0 overflow-auto self-start text-sm lg:block">
          <p className="mb-2 font-semibold text-zinc-500">Contents</p>
          <ul className="space-y-1">
            {toc.map((h, i) => (
              <li key={i} style={{ paddingLeft: (h.level - 1) * 12 }}>
                <a
                  href={`#${h.id}`}
                  className="block truncate text-zinc-600 hover:text-foreground dark:text-zinc-400"
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <article
        ref={articleRef}
        className="prose prose-zinc max-w-none flex-1 dark:prose-invert"
      >
        {/* Single-user app: content is OCR of the user's own books, so raw HTML
            (dots.mocr emits tables as HTML) is trusted. */}
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeRaw, rehypeSlug, rehypeKatex]}
          // Keep base64 data: URIs — dots.mocr embeds figures that way, and the
          // content is the user's own books. Default transform would strip them.
          urlTransform={(url) => url}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
