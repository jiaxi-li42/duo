"use client";

import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import "overlayscrollbars/overlayscrollbars.css";

// The app's main scroll column with an overlay scrollbar (takes no layout
// space, so the header and content max-w-7xl columns align for free).
// Handle colours follow the theme via .os-scrollbar vars in globals.css.
export function ScrollArea({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <OverlayScrollbarsComponent
      element="main"
      defer
      className={className}
      options={{ scrollbars: { autoHide: "scroll" } }}
    >
      {children}
    </OverlayScrollbarsComponent>
  );
}
