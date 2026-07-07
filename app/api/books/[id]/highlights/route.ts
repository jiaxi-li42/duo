import { NextResponse } from "next/server";
import { addHighlight, deleteHighlight } from "@/lib/db";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/books/[id]/highlights">,
) {
  const { id } = await ctx.params;
  const { cfi, color, text } = await request.json();
  if (!cfi || !color) {
    return NextResponse.json({ error: "cfi and color required" }, { status: 400 });
  }
  await addHighlight(id, String(cfi), String(color), String(text ?? ""));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/books/[id]/highlights">,
) {
  const { id } = await ctx.params;
  const { cfi } = await request.json();
  if (!cfi) {
    return NextResponse.json({ error: "cfi required" }, { status: 400 });
  }
  await deleteHighlight(id, String(cfi));
  return NextResponse.json({ ok: true });
}
