import { NextResponse } from "next/server";
import { createBook } from "@/lib/db";
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
  if (ext === "pdf") {
    await triggerConvert(id, fileUrl);
  } else {
    await triggerDocConvert(id, fileUrl, ext);
  }

  return NextResponse.json({ id });
}
