import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const manifest = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const peers = Object.keys(manifest.peerDependencies);

export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL("./src/index.tsx", import.meta.url)),
      formats: ["es"],
      fileName: "index",
    },
    target: "es2022",
    minify: false,
    sourcemap: true,
    rolldownOptions: {
      // The host owns these contexts and their versions, including JSX and icon subpaths.
      external: (id) => peers.some((peer) => id === peer || id.startsWith(`${peer}/`)),
    },
  },
});
