import { build, emptyDir } from "https://deno.land/x/dnt@0.39.0/mod.ts";
import packageJson from "../package.json" assert { type: "json" };

await emptyDir("./npm");

// @ts-ignore No deps
delete packageJson.dependencies;

await build({
  typeCheck: false,
  test: false,
  scriptModule: false,
  entryPoints: ["mod.ts", { name: "./jsx-runtime", path: "./jsx-runtime.ts" }, {
    name: "./dom",
    path: "./dom.ts",
  }],
  outDir: "./npm",
  shims: { deno: true },
  package: packageJson,
  compilerOptions: { lib: ["DOM", "DOM.Iterable", "ES2021"] },
  postBuild() {
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    // Deno.copyFileSync("README.md", "npm/README.md");
  },
});
