import type { BuildContext } from "@classic/build";
import { type Context, Key } from "@classic/context";
import { render } from "@classic/html";
import type { JSX } from "@classic/html";
import { jsx } from "@classic/html/jsx-runtime";
import { ClassicRequestBase } from "@classic/server";
import type { ClassicServer } from "@classic/server/runtime";
import { resolveModule } from "@classic/server/plugin/build/runtime";
import { type FileRoute, GET } from "./build.ts";
import { layoutCssTpl, pageCssTpl } from "./page.css.ts";
import type { FileBuild } from "./serve.ts";

class LayoutContext<Params> extends ClassicRequestBase<Params> {
  constructor(
    context: Context,
    server: ClassicServer,
    req: Request,
    public readonly children: JSX.Children,
  ) {
    super(context, server, req);
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
      const layouts = ctx.get($layouts) ?? ctx.provide($layouts, []);
      layouts.push(({ children }) =>
        userLayout(
          new LayoutContext<never>(
            ctx._context,
            ctx.runtime,
            ctx.request,
            children,
          ),
        )
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
      page: (context: ClassicRequestBase<Params>) => JSX.Element,
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
        jsx(() =>
          userPage(
            new ClassicRequestBase(ctx._context, ctx.runtime, ctx.request),
          )
        ),
      );
      return new Response(
        render(el, { context: ctx._context, resolve: ctx.use(resolveModule) }),
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
