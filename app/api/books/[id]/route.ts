import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { getBook, deleteBook } from "@/lib/db";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/books/[id]">,
) {
  const { id } = await ctx.params;
  const book = await getBook(id);
  if (!book) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(book);
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/books/[id]">,
) {
  const { id } = await ctx.params;
  const book = await getBook(id);
  if (book?.source_pdf_url) {
    try {
      await del(book.source_pdf_url);
    } catch (err) {
      // Not fatal — the row still gets removed even if the blob is already gone.
      console.error("Blob delete failed:", err);
    }
  }
  await deleteBook(id);
  return NextResponse.json({ ok: true });
}
