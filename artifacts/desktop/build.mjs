import { build } from "esbuild";
import { copyFile, mkdir } from "fs/promises";

const base = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
};

await mkdir("dist", { recursive: true });

await Promise.all([
  build({
    ...base,
    entryPoints: ["src/main.ts"],
    outfile: "dist/main.js",
    external: ["electron", "nfc-pcsc"],
  }),
  build({
    ...base,
    entryPoints: ["src/preload.ts"],
    outfile: "dist/preload.js",
    external: ["electron"],
  }),
  copyFile("src/setup.html", "dist/setup.html"),
]);

console.log("Desktop build complete.");
