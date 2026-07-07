"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-fetches the server-rendered shelf every few seconds while any book is
// queued/processing, so progress and status update without a manual reload.
export default function ShelfRefresher() {
  const router = useRouter();
  useEffect(() => {
    // Skip refetches while the tab is hidden — no point polling in the background.
    const id = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, 3000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
