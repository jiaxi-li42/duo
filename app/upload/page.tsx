"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Phase = "idle" | "uploading" | "creating" | "error";

const ACCEPT = ".pdf,.epub,.docx,.html,.htm,.mobi,.azw,.azw3";
const EXT_RE = /\.(pdf|epub|docx|html?|mobi|azw3?)$/i;
function extOf(name: string): string {
  const e = (name.match(EXT_RE)?.[1] ?? "").toLowerCase();
  return e === "htm" ? "html" : e;
}

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function pickFile(f: File | null) {
    setFile(f);
    if (f && !title) setTitle(f.name.replace(EXT_RE, ""));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) return;
    const ext = extOf(file.name);
    if (!ext) {
      setPhase("error");
      setError("Unsupported file type. Use PDF, EPUB, DOCX, HTML, MOBI, or AZW3.");
      return;
    }
    setError(null);
    try {
      setPhase("uploading");
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/upload-token",
        contentType: ext === "pdf" ? "application/pdf" : "application/octet-stream",
        multipart: true,
        onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
      });

      setPhase("creating");
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          author: author.trim(),
          fileUrl: blob.url,
          ext,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create book");

      router.push("/");
    } catch (err) {
      setPhase("error");
      setError((err as Error).message);
    }
  }

  const busy = phase === "uploading" || phase === "creating";
  const label =
    phase === "uploading"
      ? `Uploading… ${progress}%`
      : phase === "creating"
        ? "Starting conversion…"
        : "Upload & convert";

  return (
    <div className="mx-auto max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <h2 className="text-2xl font-semibold">Upload a book</h2>

        <div className="flex flex-col gap-2">
          <Label htmlFor="file">Book file</Label>
          {/* ponytail: native file input (styled by shadcn Input) — dropped the
              Astryx dropzone; a picker is enough for single-user upload. */}
          <Input
            id="file"
            type="file"
            accept={ACCEPT}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            PDF, EPUB, DOCX, HTML, or Kindle (MOBI/AZW3)
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="author">
            Author <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
        </div>

        {phase === "uploading" && <Progress value={progress} />}

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Upload failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={!file || !title.trim() || busy}>
          {label}
        </Button>
      </form>
    </div>
  );
}
