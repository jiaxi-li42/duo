import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

// Mints a short-lived token so the browser can upload the PDF directly to
// Vercel Blob, bypassing the ~4.5MB serverless request-body limit.
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["application/pdf"],
        maximumSizeInBytes: 1024 * 1024 * 1024, // 1 GB
        addRandomSuffix: true,
      }),
      // Conversion is triggered separately by POST /api/books once we have a
      // book id, so nothing to do on completion here.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
