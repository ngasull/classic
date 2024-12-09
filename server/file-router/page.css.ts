import { create as createHash } from "@jabr/xxhash64";
import { encodeBase64 } from "@std/encoding";
import { transform as transformCss } from "lightningcss";
import type { FileRoute } from "../file-router.ts";
import { route } from "../file-router.ts";
import type { Middleware } from "../middleware.ts";
import { staticContents } from "../middleware/staticContents.ts";
import type { BuildFunction } from "../build.ts";
import { basename } from "@std/path";
import { $addCss } from "../component.ts";

export const pageCssTpl = (tpl: TemplateStringsArray): FileRoute =>
  route({
    build: pageCss({
      css: encoder.encode(tpl[0]),
      fileName: "/index.css",
    }),
  });

export const layoutCssTpl = (tpl: TemplateStringsArray): FileRoute =>
  route({
    build: pageCss({
      css: encoder.encode(tpl[0]),
      fileName: "/layout.css",
      layout: true,
    }),
  });

export const pageCss = ({ css, fileName, layout }: {
  css: Uint8Array;
  fileName: string;
  layout?: boolean;
}): BuildFunction =>
async (route) => {
  const { code, map } = transformCss({
    filename: fileName,
    code: css,
    sourceMap: true,
  });

  const cssFileName = `${basename(fileName, ".css")}.${await encodeHash(
    code,
  )}.css`;

  const path = staticContents(route, {
    pathHint: cssFileName,
    contents: () => code,
  });

  if (map) {
    staticContents(route, {
      path: path + ".map",
      contents: () => map,
    });
  }

  if (layout) route.segment("/*").method("GET", import.meta.url, path, true);
  else route.method("GET", import.meta.url, path);
};

// export const $layoutCss = createUseKey<string[]>("layout.css");
// export const $pageCss = createUseKey<string>("page.css");

export default (cssFileName: string, layout: boolean): Middleware => (ctx) => {
  ctx.use($addCss, cssFileName);
  // if (layout) {
  //   ctx.use.provide($layoutCss, [
  //     ...ctx.use.get($layoutCss) ?? [],
  //     cssFileName,
  //   ]);
  // } else {
  //   ctx.use.provide($pageCss, cssFileName);
  // }

  return ctx.next();
};

const encoder = new TextEncoder();

export const encodeHash = async (data: Uint8Array) => {
  const hasher = await createHash();
  hasher.update(data);
  return encodeBase64(hasher.digest() as Uint8Array);
};
