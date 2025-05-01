import esbuild from "esbuild"

esbuild.build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  format: "esm",
  tsconfig: "tsconfig.json"
})