import { create as createHash } from "@jabr/xxhash64";
import { encodeBase64 } from "@std/encoding";
import { Context } from "../context.ts";
import type { FileRoute } from "../file-router.ts";
import { route } from "../file-router.ts";
import { jsx } from "../jsx-runtime.ts";
import type { RequestContextAPI } from "../middleware.ts";
import { layoutCssTpl, pageCssTpl } from "./page.css.ts";
import { render } from "../render.ts";
import type { JSX } from "../types.ts";

export const layout:
  & (<Params>(
    Layout: JSX.PFC<{ context: RequestContextAPI<Params> }>,
  ) => FileRoute<Params>)
  & {
    css: (tpl: TemplateStringsArray) => FileRoute;
  } = (UserLayout) =>
    route(
      "/*",
      {
        GET: async (ctx) => {
          const prevLayouts = ctx.get($layouts) ?? [];
          ctx.provide($layouts, [
            ...prevLayouts,
            ({ children }, context) =>
              UserLayout({
                context: ctx as RequestContextAPI<never>,
                children,
              }, context),
          ]);
          return ctx.next();
        },
      },
    );

const $layouts = Context.key<JSX.PFC[]>("layouts");

layout.css = layoutCssTpl;

export const page:
  & (<Params>(
    Page: JSX.FC<{ context: RequestContextAPI<Params> }>,
  ) => FileRoute<Params>)
  & { css: (tpl: TemplateStringsArray) => FileRoute } = (Page) =>
    route({
      GET: async (ctx) => {
        const layouts = ctx.get($layouts) ?? [];
        const el = layouts.reduceRight(
          (el, Layout) => jsx(Layout, null, el),
          jsx((_, context) => Page({ context: ctx }, context)),
        );
        return new Response(render(el, { context: ctx }), {
          headers: {
            "Content-Type": "text/html; charset=UTF-8",
          },
        });
      },
    });

page.css = pageCssTpl;

export const encodeHash = async (data: Uint8Array) => {
  const hasher = await createHash();
  hasher.update(data);
  return encodeBase64(hasher.digest() as Uint8Array);
};
