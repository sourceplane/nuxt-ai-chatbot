import { defineConfig } from "vitest/config";
import * as path from "node:path";

const web = path.resolve(__dirname, "../../apps/web");

export default defineConfig({
  resolve: {
    alias: {
      // Nuxt's `#shared` alias, as the app's server code imports it.
      "#shared": path.resolve(web, "shared"),
      // NuxtHub's virtual `hub:blob` module (the R2 bucket): an in-memory
      // stand-in, so the file helpers are tested without a Worker.
      "hub:blob": path.resolve(__dirname, "src/fakes/hub-blob.ts"),
      "@": web,
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
