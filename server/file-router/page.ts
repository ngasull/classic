import type { FileBuildContext, FileRoute } from "../file-router.ts";
import { jsx } from "../jsx-runtime.ts";
import { RequestContext } from "../middleware.ts";
import { layoutCssTpl, pageCssTpl } from "./page.css.ts";
import { render } from "../render.ts";
import type { JSX } from "../types.ts";
import { Key } from "../key.ts";
import type { BuildContext } from "../../build/context.ts";
import { devModules } from "../plugin/build.ts";

class LayoutContext<Params> extends RequestContext<Params> {
  constructor(
    parent: RequestContext<Params>,
    public readonly children: JSX.Children,
  ) {
    super(parent);
  }
}

export const layout: {
  <Params>(
    r: FileBuildContext<Params>,
    layout: (context: LayoutContext<Params>) => JSX.Element,
  ): void;
  css: (tpl: TemplateStringsArray) => FileRoute<{ [n in never]: never }>;
} = <Params>(
  r: FileBuildContext<Params>,
  userLayout: (context: LayoutContext<Params>) => JSX.Element,
) => {
  r.segment("/*").method("GET", async (ctx) => {
    const layouts = ctx.get($layouts) ?? ctx.root().provide($layouts, []);
    layouts.push(({ children }) =>
      userLayout(new LayoutContext<any>(ctx, children))
    );
    return ctx.next();
  });
};

const $layouts = new Key<JSX.PFC[]>("layouts");

layout.css = layoutCssTpl;

export const $buildContext = new Key<BuildContext>("build context");

export const page: {
  <Params>(
    r: FileBuildContext<Params>,
    page: (context: RequestContext<Params>) => JSX.Element,
  ): void;
  css: (tpl: TemplateStringsArray) => FileRoute<{ [n in never]: never }>;
} = async (r, userPage) => {
  const $resolve = await r.use(devModules);

  r.method("GET", async (ctx) => {
    const layouts = ctx.get($layouts) ?? [];
    const el = layouts.reduceRight(
      (el, Layout) => jsx(Layout, null, el),
      jsx(() => userPage(new RequestContext(ctx))),
    );
    const resolve = await ctx.use($resolve);
    return new Response(render(el, { context: ctx, resolve }), {
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
      },
    });
  });
};

page.css = pageCssTpl;
