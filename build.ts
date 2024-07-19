import { build, type BuildOpts } from "./js/build.ts";

export const opts: BuildOpts = {
  modules: {
    "@classic/dom": "js/dom.ts",
    "@classic/router": "server/client-router.ts",
    "@classic/util": "util/util.ts",
  },
  outdir: "dist",
};

if (import.meta.main) {
  await build(opts);
}
