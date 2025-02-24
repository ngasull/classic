import { create as createHash } from "@jabr/xxhash64";
import { concat } from "@std/bytes";
import { encodeBase64 } from "@std/encoding";
import { basename } from "@std/path";
import { transform as transformCss } from "lightningcss";
import type { Build } from "../build.ts";
import { $addCss } from "../component.ts";
import type { FileBuild } from "../file-router.ts";
import { serveAsset } from "../plugin/serveAsset.ts";
import type { Middleware } from "../request.ts";

const makeTpl =
  <T>(cb: (css: Uint8Array) => T) =>
  (tpl: TemplateStringsArray, ...values: Array<string | Uint8Array>): T => {
    const parts = values.flatMap((v, i) => [
      typeof v === "string" ? encoder.encode(v) : v,
      encoder.encode(tpl[i + 1]),
    ]);
    parts.unshift(encoder.encode(tpl[0]));
    return cb(concat(parts));
  };

export const pageCssTpl: (
  tpl: TemplateStringsArray,
  ...values: Array<string | Uint8Array>
) => <Params>(b: FileBuild<Params>) => Promise<void> = makeTpl((css) => (r) =>
  r.build(pageCss, {
    css,
    fileName: "/index.css",
  })
);

export const layoutCssTpl: (
  tpl: TemplateStringsArray,
  ...values: Array<string | Uint8Array>
) => <Params>(b: FileBuild<Params>) => Promise<void> = makeTpl((css) => (r) =>
  r.build(pageCss, {
    css,
    fileName: "/layout.css",
    layout: true,
  })
);

export const pageCss = async (route: Build, { css, fileName, layout }: {
  css: Uint8Array;
  fileName: string;
  layout?: boolean;
}) => {
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
