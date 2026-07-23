import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
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
