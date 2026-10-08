import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// No Content-Security-Policy here: Vite's dev server needs its own scripts.
// The API sets a strict policy on JSON responses. A production host for this
// web app should send frame denial, nosniff, and the same robots tag.
// package.json passes --config vite.config.ts. Vite loads vite.config.js
// first, and an older tsc emit of that file would hide this one.
const documentHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow",
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    headers: documentHeaders,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    headers: documentHeaders,
  },
});
