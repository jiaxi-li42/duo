import { NextResponse } from "next/server";
import { approveBook } from "@/lib/db";

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/books/[id]/approve">,
) {
  const { id } = await ctx.params;
  await approveBook(id);
  return NextResponse.json({ ok: true });
}
