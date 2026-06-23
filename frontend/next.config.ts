import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export (SPEC §6): the dashboard is a client-rendered SPA that
  // streams data from api.niminal.xyz, so it ships as static assets on Vercel.
  output: "export",
  // Emit /path/index.html so any static host serves clean URLs.
  trailingSlash: true,
};

export default nextConfig;
