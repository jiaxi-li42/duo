import Link from "next/link";

// Shown when there are no books at all — nudges the first upload.
export function EmptyShelf() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <h2 className="text-xl font-semibold">Your shelf is empty</h2>
      <p className="text-muted-foreground">
        Upload a scanned PDF to turn it into a readable book.
      </p>
      <Link
        href="/upload"
        className="font-medium text-primary underline underline-offset-4"
      >
        Upload your first book
      </Link>
    </div>
  );
}
