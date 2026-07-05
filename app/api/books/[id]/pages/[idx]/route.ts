import { NextResponse } from "next/server";
import { getBook, getPage, savePage } from "@/lib/db";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/books/[id]/pages/[idx]">,
) {
  const { id, idx } = await ctx.params;
  const book = await getBook(id);
  if (!book) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(await getPage(book, Number(idx)));
}

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/books/[id]/pages/[idx]">,
) {
  const { id, idx } = await ctx.params;
  const { markdown } = await request.json();
  await savePage(id, Number(idx), markdown ?? "");
  return NextResponse.json({ ok: true });
}
