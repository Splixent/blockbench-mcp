import { defineConfig } from "tsup";
import { resolve } from "path";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  outDir: "dist",
  clean: true,
  noExternal: [/@shared/],
  esbuildOptions(options) {
    options.alias = {
      "@shared": resolve(__dirname, "../../packages/shared/src"),
    };
  },
});
