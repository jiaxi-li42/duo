"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";

// Flips light/dark and persists the choice. The pre-paint script in the layout
// applies the stored preference (falling back to the OS) before this mounts, so
// there's no flash; here we just read the resulting class and let the user change it.
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="rounded-full text-muted-foreground"
    >
      {/* Always the moon; it fills in when dark mode is on. */}
      <Icon name="dark_mode" fill={dark} className="text-xl" />
    </Button>
  );
}
