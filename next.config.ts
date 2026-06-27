import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sibling projects under the GitHub folder have their own lockfiles; pin the
  // workspace root to this app so Turbopack doesn't guess.
  turbopack: { root: __dirname },
};

export default nextConfig;
