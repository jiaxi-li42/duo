"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { upload } from "@vercel/blob/client";

type Phase = "idle" | "uploading" | "creating" | "error";

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function pickFile(f: File | null) {
    if (!f) return;
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.pdf$/i, ""));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setError(null);
    try {
      setPhase("uploading");
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/upload-token",
        contentType: "application/pdf",
        multipart: true,
        onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
      });

      setPhase("creating");
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), author: author.trim(), pdfUrl: blob.url }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create book");

      router.push("/");
    } catch (err) {
      setPhase("error");
      setError((err as Error).message);
    }
  }

  const busy = phase === "uploading" || phase === "creating";

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold">Upload a scanned book</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <label
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-black/15 px-6 py-10 text-center hover:border-black/30 dark:border-white/20 dark:hover:border-white/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pickFile(e.dataTransfer.files[0] ?? null);
          }}
        >
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <span className="text-sm font-medium">{file.name}</span>
          ) : (
            <span className="text-sm text-zinc-500">
              Drop a PDF here, or click to choose
            </span>
          )}
        </label>

        <div>
          <label className="mb-1 block text-sm font-medium">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Author <span className="text-zinc-400">(optional)</span>
          </label>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
          />
        </div>

        {phase === "uploading" && (
          <div className="h-2 overflow-hidden rounded bg-black/10 dark:bg-white/15">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={!file || !title.trim() || busy}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {phase === "uploading"
            ? `Uploading… ${progress}%`
            : phase === "creating"
              ? "Starting conversion…"
              : "Upload & convert"}
        </button>
      </form>
    </div>
  );
}
