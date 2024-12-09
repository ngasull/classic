import { create as createHash } from "@jabr/xxhash64";
import { encodeBase64 } from "@std/encoding";
import { Context } from "../context.ts";
import type { FileRoute } from "../file-router.ts";
import { route } from "../file-router.ts";
import { jsx } from "../jsx-runtime.ts";
import { type MiddlewareContext, RequestContext } from "../middleware.ts";
import { layoutCssTpl, pageCssTpl } from "./page.css.ts";
import { render } from "../render.ts";
import type { JSX } from "../types.ts";

class LayoutContext<Params> extends RequestContext<Params> {
  constructor(
    parent: MiddlewareContext<Params>,
    public readonly children: JSX.Children,
  ) {
    super(parent);
  }
}

export const layout: {
  <Params>(
    layout: (context: LayoutContext<Params>) => JSX.Element,
  ): FileRoute<Params>;
  css: (tpl: TemplateStringsArray) => FileRoute;
} = <Params>(userLayout: (context: LayoutContext<Params>) => JSX.Element) =>
  route("/*", {
    GET: async (ctx) => {
      const prevLayouts = ctx.get($layouts) ?? [];
      ctx.provide($layouts, [
        ...prevLayouts,
        ({ children }) => userLayout(new LayoutContext<any>(ctx, children)),
      ]);
      return ctx.next();
    },
  }) as FileRoute<Params>;

const $layouts = Context.key<JSX.PFC[]>("layouts");

layout.css = layoutCssTpl;

export const page: {
  <Params>(
    page: (context: RequestContext<Params>) => JSX.Element,
  ): FileRoute<Params>;
  css: (tpl: TemplateStringsArray) => FileRoute;
} = (userPage) =>
  route({
    GET: async (ctx) => {
      const layouts = ctx.get($layouts) ?? [];
      const el = layouts.reduceRight(
        (el, Layout) => jsx(Layout, null, el),
        jsx(() => userPage(new RequestContext(ctx))),
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
