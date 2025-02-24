import type { Context } from "../context.ts";
import { type FileBuild, type FileRoute, GET } from "../file-router.ts";
import { jsx } from "../jsx-runtime.ts";
import { Key } from "../key.ts";
import { layoutCssTpl, pageCssTpl } from "./page.css.ts";
import { render } from "../render.ts";
import { ClassicRequestBase } from "../request.ts";
import type { JSX } from "../types.ts";
import type { BuildContext } from "../../build/context.ts";
import { resolveModule } from "../plugin/build-serve.ts";
import type { ClassicServer } from "../server.ts";

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
