import type {
  ContextVariableMap,
  Env,
  Input,
  MiddlewareHandler,
  ParamKeys,
} from "../deps/hono.ts";
import { bundleSymbol } from "../hono.ts";
import { jsx } from "../jsx-runtime.ts";
import { contextAPI, createContext, renderToStream } from "../jsx/render.ts";
import {
  Component,
  InitContext,
  JSXChildren,
  JSXElement,
  ParentComponent,
} from "../jsx/types.ts";

declare module "../deps/hono.ts" {
  interface ContextRenderer {
    (content: JSXElement): Response | Promise<Response>;
  }
  interface ContextVariableMap {
    readonly [composedLayoutSymbol]?: ParentComponent<Record<string, unknown>>;
    readonly [layoutSymbol]?: ParentComponent<Record<string, unknown>>;
    readonly [jsxContextSymbol]?: InitContext<unknown>[];
  }
}

export const honoContext = createContext("hono");

const composedLayoutSymbol = Symbol("composedLayout");
const layoutSymbol = Symbol("layout");
const jsxContextSymbol = Symbol("jsxContext");

export const jsxRenderer = <
  E extends Env & { Variables: ContextVariableMap },
  P extends string,
  I extends Input,
>(): MiddlewareHandler<E, P, I> =>
async (c, next) => {
  c.set(jsxContextSymbol, [honoContext.init(c)]);

  c.setRenderer((content: JSXElement) => {
    const Layout = c.get(layoutSymbol);
    const ComposedLayout = c.get(composedLayoutSymbol);

    if (c.req.query("_layout") != null && !Layout) return c.notFound();

    content = jsx("div", { "data-route": c.req.path, children: content });

    return c.body(
      renderToStream(
        c.req.query("_layout") != null
          ? jsx(
            Layout!,
            c.req.param() as any,
            jsx("progress", { "data-route": "" }),
          )
          : c.req.query("_index") == null && ComposedLayout
          ? jsx(ComposedLayout, null, content)
          : content,
        {
          context: c.get(jsxContextSymbol),
          bundle: c.get(bundleSymbol),
        },
      ),
      { headers: { "Content-Type": "text/html; charset=UTF-8" } },
    );
  });

  await next();

  c.set(jsxContextSymbol, undefined);
};

export const jsxContext =
  (...context: InitContext<unknown>[]): MiddlewareHandler =>
  async (
    c,
    next,
  ) => {
    const inits = c.get(jsxContextSymbol)!;
    inits.push(...context);
    await next();
    inits.splice(inits.length - context.length, context.length);
  };

export const layout = <
  E extends Env & { Variables: ContextVariableMap },
  P extends string,
  I extends Input,
>(
  Layout: ParentComponent<Record<ParamKeys<P>, string>>,
): MiddlewareHandler<E, P, I> =>
async (c, next) => {
  const { routePath } = c.req;
  const params = c.req.param() as any;

  const ParentLayout = c.get(layoutSymbol);
  const ParentComposed = c.get(composedLayoutSymbol);
  const ComposedLayout = ParentComposed && Layout
    ? (({ children }: { children?: JSXChildren }) =>
      jsx(
        ParentComposed,
        null,
        jsx(
          "div",
          {
            "data-route": c.req.path.split("/").slice(
              0,
              routePath.replace(/\/\*?$/, "").split("/").length,
            ).join("/"),
          },
          jsx(
            Layout as ParentComponent<Record<string, string>>,
            params,
            children,
          ),
        ),
      ))
    : ParentComposed ?? Layout;

  c.set(composedLayoutSymbol, ComposedLayout as ParentComponent);
  c.set(layoutSymbol, Layout as ParentComponent);

  await next();

  c.set(layoutSymbol, ParentLayout);
  c.set(composedLayoutSymbol, ParentComposed);
};

export const route = <
  E extends Env & { Variables: ContextVariableMap },
  P extends string,
  I extends Input,
>(
  Index: Component<Record<ParamKeys<P>, string>>,
): MiddlewareHandler<E, P, I> =>
(c) =>
  Promise.resolve(
    c.render(Index(c.req.param() as any, contextAPI(c.get(jsxContextSymbol)))),
  );
