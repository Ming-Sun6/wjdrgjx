import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: "/map-tool/",
  plugins: [vue()],
  build: {
    outDir: "dist",
  },
});
