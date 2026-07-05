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
import { getBook, getProgress, getPageMarkdowns } from "@/lib/db";
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

export default async function ReadPage(props: PageProps<"/book/[id]/read">) {
  const { id } = await props.params;
  const book = await getBook(id);
  if (!book) notFound();

  const markdowns = await getPageMarkdowns(book);
  const sections = (markdowns.length ? markdowns : ["*No content.*"]).map(
    renderFragment,
  );
  const toc = sections.flatMap(extractHeadings);

  // Progress is now a CFI string; ignore legacy numeric scroll positions.
  const saved = await getProgress(id);
  const initialCFI = saved?.startsWith("epubcfi(") ? saved : null;

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
      <Reader id={book.id} sections={sections} toc={toc} initialCFI={initialCFI} />
    </div>
  );
}
