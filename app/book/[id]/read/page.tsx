import Link from "next/link";
import { notFound } from "next/navigation";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import {
  getBook,
  getProgress,
  getPageMarkdowns,
  listHighlights,
  type Book,
} from "@/lib/db";
import Reader, { type TocItem } from "./reader";

export const dynamic = "force-dynamic";

// Same plugin set the old reader used, but serialized to an HTML string so each
// page can render inside foliate's iframe: math pre-rendered (no client KaTeX),
// raw HTML (dots.mocr tables) and base64 data: figures preserved (no sanitizer).
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSlug)
  .use(rehypeKatex)
  .use(rehypeStringify, { allowDangerousHtml: true });

const renderFragment = (markdown: string): string =>
  String(processor.processSync(markdown));

const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

// Pull h1–h3 headings (with the ids rehype-slug generated) out of a rendered
// section so we can drive our own TOC without loading every section's DOM.
function extractHeadings(html: string, index: number): TocItem[] {
  const out: TocItem[] = [];
  const re = /<h([123])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = stripTags(m[3]);
    if (text) out.push({ index, id: m[2], text, level: Number(m[1]) });
  }
  return out;
}

// Rendering every section's markdown → HTML through the unified pipeline is the
// costly part of a reader load, and it only changes when the book does — so
// memoize the result per (id, updated_at). ponytail: in-process LRU capped at 8;
// a warm server serves re-opens for free, a restart just recomputes once. Move to
// unstable_cache / precompute-at-approve only if it needs to survive restarts.
type Rendered = { sections: string[]; toc: TocItem[] };
const RENDER_CACHE_MAX = 8;
const renderCache = new Map<string, Rendered>();

async function renderBook(book: Book): Promise<Rendered> {
  const key = `${book.id}:${book.updated_at}`;
  const hit = renderCache.get(key);
  if (hit) {
    renderCache.delete(key);
    renderCache.set(key, hit); // refresh recency
    return hit;
  }
  const markdowns = await getPageMarkdowns(book);
  const sections = (markdowns.length ? markdowns : ["*No content.*"]).map(
    renderFragment,
  );
  const value: Rendered = { sections, toc: sections.flatMap(extractHeadings) };
  renderCache.set(key, value);
  if (renderCache.size > RENDER_CACHE_MAX) {
    const oldest = renderCache.keys().next().value;
    if (oldest) renderCache.delete(oldest);
  }
  return value;
}

export default async function ReadPage(props: PageProps<"/book/[id]/read">) {
  const { id } = await props.params;
  const book = await getBook(id);
  if (!book) notFound();

  const { sections, toc } = await renderBook(book);

  // Progress is now a CFI string; ignore legacy numeric scroll positions.
  const saved = await getProgress(id);
  const initialCFI = saved?.startsWith("epubcfi(") ? saved : null;

  const highlights = await listHighlights(id);

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:underline">
            ← Bookshelf
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{book.title}</h1>
          {book.author && <p className="text-sm text-zinc-500">{book.author}</p>}
        </div>
        <Link
          href={`/book/${id}/review`}
          className="text-sm text-zinc-500 hover:underline"
        >
          Edit
        </Link>
      </div>
      <Reader
        id={book.id}
        sections={sections}
        toc={toc}
        initialCFI={initialCFI}
        initialHighlights={highlights}
      />
    </div>
  );
}
