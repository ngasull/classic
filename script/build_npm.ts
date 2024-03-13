import { build, emptyDir } from "https://deno.land/x/dnt@0.39.0/mod.ts";

await emptyDir("./npm");

await build({
  typeCheck: false,
  test: false,
  scriptModule: false,
  entryPoints: [{ name: "./jsx-runtime", path: "./jsx-runtime.ts" }, {
    name: "./dom",
    path: "./dom.ts",
  }, {
    name: "./js/bundle",
    path: "./js/bundle.ts",
  }],
  outDir: "./npm",
  shims: { deno: true },
  package: {
    name: "classic-web",
    version: "1",
  },
  compilerOptions: { lib: ["DOM", "DOM.Iterable", "ES2021"] },
  postBuild() {
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    // Deno.copyFileSync("README.md", "npm/README.md");
  },
});
