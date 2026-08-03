import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";

export default defineConfig({
  base: "./", // relative Asset-Pfade — Build muss auch per file:// (ohne Server) laufen
  plugins: [react(), viteSingleFile()], // alles (JS+CSS) inline in eine index.html — sonst blockt Chrome/Edge das Nachladen des Scripts unter file:// (CORS)
  build: { target: "es2020" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".."),
      "tone": path.resolve(__dirname, "node_modules/tone"),
    },
  },
  server: {
    fs: { allow: [".."] },
  },
});
