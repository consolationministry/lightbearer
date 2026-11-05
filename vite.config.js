import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    rollupOptions: {
      input: {
        index: path.resolve(root, "index.html"),
        gallery: path.resolve(root, "gallery.html"),
        hymnal: path.resolve(root, "hymnal.html"),
        forms: path.resolve(root, "forms.html"),
        adminForms: path.resolve(root, "admin/forms.html"),
        adminPrayerInbox: path.resolve(root, "admin/prayer-inbox.html"),
        adminIndex: path.resolve(root, "admin/index.html"),
        adminPrayerDetail: path.resolve(root, "admin/prayer-detail.html")
      }
    }
  }
});
