import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { getBook, deleteBook, updateBook } from "@/lib/db";

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
  // Remove the book's blobs (source file + cover) so deletes don't leak storage.
  // Covers are usually inline data URIs — passing one to del() throws and would
  // skip deleting the real blobs too, so only real URLs make the list.
  const blobs = [book?.source_pdf_url, book?.cover_url].filter(
    (u): u is string => !!u && u.startsWith("http"),
  );
  if (blobs.length) {
    try {
      await del(blobs);
    } catch (err) {
      // Not fatal — the row still gets removed even if a blob is already gone.
      console.error("Blob delete failed:", err);
    }
  }
  await deleteBook(id);
  return NextResponse.json({ ok: true });
}

// Archive / unarchive: moves a book into (or out of) the Archived shelf without
// touching its reading state.
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/books/[id]">,
) {
  const { id } = await ctx.params;
  const { archived } = await request.json();
  await updateBook(id, { archived: archived ? 1 : 0 });
  return NextResponse.json({ ok: true });
}
