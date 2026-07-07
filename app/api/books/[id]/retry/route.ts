import { NextResponse } from "next/server";
import { getBook, updateBook } from "@/lib/db";
import { triggerConvert, triggerDocConvert } from "@/lib/convert";

// Extensions the doc converter handles; anything else is treated as a scanned PDF.
const EXT_RE = /\.(pdf|epub|docx|html?|mobi|azw3?)$/i;
function extOf(url: string): string {
  const e = (url.split(/[?#]/)[0].match(EXT_RE)?.[1] ?? "pdf").toLowerCase();
  return e === "htm" ? "html" : e;
}

// Re-run conversion for a failed book: reset its state and re-trigger the *right*
// Modal converter — OCR for PDFs, pandoc for imported docs. Retrying a failed
// EPUB/DOCX through the OCR path would just fail again.
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/books/[id]/retry">,
) {
  const { id } = await ctx.params;
  const book = await getBook(id);
  if (!book) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!book.source_pdf_url) {
    return NextResponse.json({ error: "no source file to retry" }, { status: 400 });
  }

  await updateBook(id, {
    status: "queued",
    error: null,
    pages_done: 0,
    page_count: null,
    content: null,
  });
  const ext = extOf(book.source_pdf_url);
  if (ext === "pdf") {
    await triggerConvert(id, book.source_pdf_url);
  } else {
    await triggerDocConvert(id, book.source_pdf_url, ext);
  }

  return NextResponse.json({ ok: true });
}
