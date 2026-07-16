import { NextResponse } from "next/server";
import { createBook, updateBook } from "@/lib/db";
import { triggerConvert, triggerDocConvert } from "@/lib/convert";

// Create a book row, then kick off the right Modal converter: scanned PDFs go
// through OCR; EPUB/DOCX/HTML/MOBI/AZW3 go through pandoc. Both update
// status/progress/content directly in the DB as they work.
export async function POST(request: Request) {
  const body = await request.json();
  const { title, author } = body;
  const fileUrl: string | undefined = body.fileUrl ?? body.pdfUrl;
  const ext = (body.ext ?? "pdf").toLowerCase();
  if (!title || !fileUrl) {
    return NextResponse.json(
      { error: "title and fileUrl are required" },
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  await createBook({ id, title, author: author || null, source_pdf_url: fileUrl });
  // Custom cover (a small data URI, like Modal-generated ones); the converter
  // only fills cover_url when it's still NULL, so this one sticks.
  const coverUrl = body.coverUrl;
  if (
    typeof coverUrl === "string" &&
    coverUrl.startsWith("data:image/") &&
    coverUrl.length < 500_000
  ) {
    await updateBook(id, { cover_url: coverUrl });
  }
  // Trigger failure must not strand the row in "queued" (there's no retry):
  // mark it errored so it surfaces as a Failed tile, and tell the uploader.
  try {
    if (ext === "pdf") {
      await triggerConvert(id, fileUrl);
    } else {
      await triggerDocConvert(id, fileUrl, ext);
    }
  } catch {
    await updateBook(id, {
      status: "error",
      error: "Conversion never started — the converter couldn't be reached.",
    });
    return NextResponse.json(
      { error: "conversion failed to start — the book is marked as failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({ id });
}
