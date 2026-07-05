import { NextResponse } from "next/server";
import { getBook, listPages } from "@/lib/db";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/books/[id]/pages">,
) {
  const { id } = await ctx.params;
  const book = await getBook(id);
  if (!book) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(await listPages(book));
}
