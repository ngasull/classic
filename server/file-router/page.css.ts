import { create as createHash } from "@jabr/xxhash64";
import { encodeBase64 } from "@std/encoding";
import { basename } from "@std/path";
import { transform as transformCss } from "lightningcss";
import type { FileRoute } from "../file-router.ts";
import type { Middleware } from "../middleware.ts";
import { $addCss } from "../component.ts";
import type { BuildRoute } from "../mod.ts";
import { serveAsset } from "../plugin/asset.ts";

export const pageCssTpl =
  <Params>(tpl: TemplateStringsArray): FileRoute<Params> => (r) => {
    r.useBuild(pageCss({
      css: encoder.encode(tpl[0]),
      fileName: "/index.css",
    }));
  };

export const layoutCssTpl =
  <Params>(tpl: TemplateStringsArray): FileRoute<Params> => (r) => {
    r.useBuild(pageCss({
      css: encoder.encode(tpl[0]),
      fileName: "/layout.css",
      layout: true,
    }));
  };

export const pageCss = ({ css, fileName, layout }: {
  css: Uint8Array;
  fileName: string;
  layout?: boolean;
}) =>
async (route: BuildRoute): Promise<void> => {
  const { code, map } = transformCss({
    filename: fileName,
    code: css,
    sourceMap: true,
  });

  const cssFileName = `${basename(fileName, ".css")}.${await encodeHash(
    code,
  )}.css`;

  const path = route.use(serveAsset, {
    pathHint: cssFileName,
    contents: () => code,
  });

  if (map) {
    route.use(serveAsset, {
      path: path + ".map",
      contents: () => map,
    });
  }

  if (layout) route.segment("/*").method("GET", import.meta.url, path, true);
  else route.method("GET", import.meta.url, path);
};

export default (cssFileName: string): Middleware => (ctx) => {
  ctx.use($addCss, cssFileName);
  return ctx.next();
};

const encoder = new TextEncoder();

export const encodeHash = async (data: Uint8Array) => {
  const hasher = await createHash();
  hasher.update(data);
  return encodeBase64(hasher.digest() as Uint8Array);
};
