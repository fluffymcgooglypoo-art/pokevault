import { build } from "esbuild";

const base = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
};

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
]);

console.log("Desktop build complete.");
