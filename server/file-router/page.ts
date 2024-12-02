import { create as createHash } from "@jabr/xxhash64";
import { encodeBase64 } from "@std/encoding";
import { createUseKey } from "../use.ts";
import type { FileRoute } from "../file-router.ts";
import { route, routeGet } from "../file-router.ts";
import { jsx } from "../jsx-runtime.ts";
import type { RequestContextAPI } from "../middleware.ts";
import { layoutCssTpl, pageCssTpl } from "./page.css.ts";
import { render } from "../render.ts";
import type { JSX } from "../types.ts";

export const layout:
  & (<Params>(
    Layout: JSX.PFC<{ ctx: RequestContextAPI<Params> }>,
  ) => FileRoute<Params>)
  & {
    css: (tpl: TemplateStringsArray) => FileRoute;
  } = (UserLayout) =>
    route(
      "/*",
      routeGet<any>(async (ctx) => {
        const prevLayouts = ctx.use.get($layouts) ?? [];
        ctx.use.provide($layouts, [...prevLayouts, ({ children }, use) =>
          UserLayout({ ctx, children }, use)]);
        return ctx.next();
      }),
    );

const $layouts = createUseKey<JSX.PFC[]>("layouts");

layout.css = layoutCssTpl;

export const page:
  & (<Params>(
    Page: JSX.FC<{ ctx: RequestContextAPI<Params> }>,
  ) => FileRoute<Params>)
  & { css: (tpl: TemplateStringsArray) => FileRoute } = (Page) =>
    routeGet(async (ctx) => {
      const layouts = ctx.use.get($layouts) ?? [];
      const el = layouts.reduceRight(
        (el, Layout) => jsx(Layout, null, el),
        jsx((_, use) => Page({ ctx }, use)),
      );
      return new Response(render(el, { use: ctx.use }), {
        headers: {
          "Content-Type": "text/html; charset=UTF-8",
        },
      });
    });

page.css = pageCssTpl;

export const encodeHash = async (data: Uint8Array) => {
  const hasher = await createHash();
  hasher.update(data);
  return encodeBase64(hasher.digest() as Uint8Array);
};
