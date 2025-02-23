import { type FileBuild, type FileRoute, GET } from "../file-router.ts";
import { jsx } from "../jsx-runtime.ts";
import { Key } from "../key.ts";
import { ClassicRequest } from "../middleware.ts";
import { layoutCssTpl, pageCssTpl } from "./page.css.ts";
import { render } from "../render.ts";
import type { JSX } from "../types.ts";
import type { BuildContext } from "../../build/context.ts";
import { resolveModule } from "../plugin/build-serve.ts";

class LayoutContext<Params> extends ClassicRequest<Params> {
  constructor(
    parent: ClassicRequest<Params>,
    public readonly children: JSX.Children,
  ) {
    super(parent);
  }
}

export const layout:
  & (
    <Params>(
      r: FileBuild<Params>,
      layout: (context: LayoutContext<Params>) => JSX.Element,
    ) => void
  )
  & {
    css: (
      tpl: TemplateStringsArray,
      ...values: Array<string | Uint8Array>
    ) => FileRoute<{ [n in never]: never }>;
  } = (r, userLayout) => {
    r.segment("/*").use(GET, async (ctx) => {
      const layouts = ctx.get($layouts) ?? ctx.root.provide($layouts, []);
      layouts.push(({ children }) =>
        userLayout(new LayoutContext<any>(ctx, children))
      );
      return ctx.next();
    });
  };

const $layouts = new Key<JSX.PFC[]>("layouts");

layout.css = layoutCssTpl;

export const $buildContext = new Key<BuildContext>("build context");

export const page:
  & (
    <Params>(
      r: FileBuild<Params>,
      page: (context: ClassicRequest<Params>) => JSX.Element,
    ) => Promise<void>
  )
  & {
    css: (
      tpl: TemplateStringsArray,
      ...values: Array<string | Uint8Array>
    ) => FileRoute<{ [n in never]: never }>;
  } = async (r, userPage) => {
    r.use(GET, async (ctx) => {
      const layouts = ctx.get($layouts) ?? [];
      const el = layouts.reduceRight(
        (el, Layout) => jsx(Layout, null, el),
        jsx(() => userPage(new ClassicRequest(ctx))),
      );
      return new Response(
        render(el, { context: ctx, resolve: ctx.use(resolveModule) }),
        {
          headers: {
            "Content-Type": "text/html; charset=UTF-8",
          },
        },
      );
    });
  };

page.css = pageCssTpl as (
  tpl: TemplateStringsArray,
) => FileRoute<{ [n in never]: never }>;
