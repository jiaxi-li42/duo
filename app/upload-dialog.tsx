"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fileToCover } from "@/lib/cover";

type Phase = "idle" | "uploading" | "creating";

const ACCEPT = ".pdf,.epub,.docx,.html,.htm,.mobi,.azw,.azw3";
const EXT_RE = /\.(pdf|epub|docx|html?|mobi|azw3?)$/i;
function extOf(name: string): string {
  const e = (name.match(EXT_RE)?.[1] ?? "").toLowerCase();
  return e === "htm" ? "html" : e;
}

// The upload flow as a dialog (mirrors the combine dialog's layout): pick a
// file, optionally add a cover, name it, and kick off blob upload + conversion.
// `trigger` is rendered as the DialogTrigger; `children` is its content.
export function UploadDialog({
  trigger,
  children,
}: {
  trigger: React.ReactElement;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  // Fresh form on open; closing mid-upload aborts the transfer.
  const openChange = (next: boolean) => {
    if (next) {
      setFile(null);
      setTitle("");
      setAuthor("");
      setCover(null);
      setPhase("idle");
      setProgress(0);
    } else {
      abortRef.current?.abort();
    }
    setOpen(next);
  };

  function pickFile(f: File | null) {
    setFile(f);
    if (f && !title) setTitle(f.name.replace(EXT_RE, ""));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) return;
    const ext = extOf(file.name);
    if (!ext) {
      toast.error("Unsupported file type", {
        description: "Please use PDF, EPUB, DOCX, HTML, MOBI, or AZW3.",
      });
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      setPhase("uploading");
      setProgress(0);
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/upload-token",
        contentType: ext === "pdf" ? "application/pdf" : "application/octet-stream",
        multipart: true,
        abortSignal: ac.signal,
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
          coverUrl: cover ?? undefined,
        }),
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => null))?.error;
        throw new Error(msg ?? "Failed to create book");
      }

      setOpen(false);
      router.refresh();
    } catch (err) {
      setPhase("idle");
      setProgress(0);
      if (ac.signal.aborted) {
        toast("Upload cancelled");
        return;
      }
      toast.error("Upload failed", { description: (err as Error).message });
    }
  }

  const busy = phase !== "idle";
  const label =
    phase === "uploading"
      ? `Uploading… ${progress}%`
      : phase === "creating"
        ? "Starting conversion…"
        : "Upload";

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger render={trigger}>{children}</DialogTrigger>
      <DialogContent className="gap-4 p-4 ring-0 rounded-4xl sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="items-center text-center">
          <DialogTitle className="text-xl font-normal pt-2">Upload a book</DialogTitle>
          <DialogDescription>
            Pick a PDF, EPUB, DOCX, HTML, or Kindle (MOBI/AZW3) file and
            we&apos;ll convert it into a readable digital book.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Cover: letter-fallback placeholder until the user uploads one. */}
          <div className="flex flex-col items-center">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt="Cover"
                className="h-40 w-auto rounded-sm object-cover ring-1 ring-foreground/10"
              />
            ) : (
              <div className="h-40 w-28 rounded-sm bg-muted" />
            )}
            <Button
              type="button"
              variant="link"
              className="text-foreground underline hover:text-muted-foreground"
              onClick={() => coverRef.current?.click()}
            >
              Upload cover
            </Button>
            <input
              ref={coverRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setCover(await fileToCover(f));
                e.target.value = "";
              }}
            />
          </div>

          <Input
            aria-label="Book file"
            type="file"
            accept={ACCEPT}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <Input
            aria-label="Title"
            placeholder="Title"
            className="rounded-none border-0 border-b px-0 focus-visible:ring-0 dark:bg-transparent"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            aria-label="Author"
            placeholder="Author (optional)"
            className="rounded-none border-0 border-b px-0 focus-visible:ring-0 dark:bg-transparent"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-6">
            <DialogClose
              render={<Button type="button" variant="outline" size="lg" className="rounded-full px-4" />}
            >
              Cancel
            </DialogClose>
            <Button
              type="submit"
              size="lg"
              className="rounded-full px-4"
              disabled={!file || !title.trim() || busy}
            >
              {label}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
