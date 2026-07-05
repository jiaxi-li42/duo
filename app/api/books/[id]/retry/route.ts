import { NextResponse } from "next/server";
import { getBook, updateBook } from "@/lib/db";
import { triggerConvert } from "@/lib/convert";

// Re-run conversion for a failed book: reset its state and re-trigger Modal.
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
    return NextResponse.json({ error: "no source PDF to retry" }, { status: 400 });
  }

  await updateBook(id, {
    status: "queued",
    error: null,
    pages_done: 0,
    page_count: null,
    content: null,
  });
  await triggerConvert(id, book.source_pdf_url);

  return NextResponse.json({ ok: true });
}
