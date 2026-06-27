import { NextResponse } from "next/server";
import { setProgress } from "@/lib/db";

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/books/[id]/progress">,
) {
  const { id } = await ctx.params;
  const { position } = await request.json();
  await setProgress(id, String(position));
  return NextResponse.json({ ok: true });
}
