import { build } from "./js/build.ts";

if (import.meta.main) {
  await build({
    modules: {
      "@classic/js/dom": "js/dom.ts",
      "@classic/js/dom/util": "js/dom/util.ts",
    },
    outdir: "js/dist",
  });
  await build({
    modules: {
      "@classic/router": "server/client-router.ts",
    },
    external: ["@classic/js/dom", "@classic/js/dom/util"],
    outdir: "server/dist",
  });
}
