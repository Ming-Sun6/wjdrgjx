import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  base: "/function/bear-damage/",
  plugins: [react()],
  build: mode === "library" ? {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "damage-model",
    }, outDir: "dist-core",
  } : {},
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
}));
