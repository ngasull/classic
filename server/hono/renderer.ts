import type { JS } from "classic/js";
import { Context, Hono } from "hono";
import type { Env, MiddlewareHandler, Schema } from "hono/types";
import type { ClassicBundle } from "../../element/serve.ts";
import { classicBundleContext } from "../component.ts";
import { jsx } from "../jsx-runtime.ts";
import { createContext, renderToStream } from "../render.ts";
import {
  JSX,
  JSXChildren,
  JSXComponent,
  JSXInitContext,
  JSXParentComponent,
} from "../types.ts";

import "../../router/cc-route.ts";

declare module "hono" {
  interface ContextRenderer {
    (content: JSX.Element): Response | Promise<Response>;
  }
  interface ContextVariableMap {
    readonly [domRouterSymbol]: JS<typeof import("../../dom/router.ts")>;
    readonly [composedLayoutSymbol]?: JSXParentComponent<
      Record<string, unknown>
    >;
    readonly [layoutSymbol]?: JSXParentComponent<Record<string, unknown>>;
    readonly [jsxContextSymbol]?: JSXInitContext<unknown>[];
  }
}

export const honoContext = createContext("hono");

const domRouterSymbol = Symbol("domRouter");
const composedLayoutSymbol = Symbol("composedLayout");
const layoutSymbol = Symbol("layout");
const jsxContextSymbol = Symbol("jsxContext");

export const classicElements = (bundle: ClassicBundle): MiddlewareHandler =>
  jsxContext(classicBundleContext(bundle));

export const jsxContext =
  (...context: JSXInitContext<unknown>[]): MiddlewareHandler =>
  async (
    c,
    next,
  ) => {
    let inits = c.get(jsxContextSymbol);
    if (!inits) c.set(jsxContextSymbol, inits = []);
    inits.push(...context);
    await next();
    inits.splice(inits.length - context.length, context.length);
  };

export const route = <E extends Env, S extends Schema, P extends string>(
  { layout: Layout, part: Part }: {
    layout?: JSXParentComponent<Record<P, string>>;
    part?: JSXComponent<Record<P, string>>;
  },
): Hono<E, S, P> => {
  const app = new Hono<E, S, P>();
  let routePathMemo: string | null = null;
  const routePath = (c: Context<E, P>): string =>
    routePathMemo ??= c.req.routePath.split("/").slice(0, -1).join("/");

  if (Layout) {
    app.get(
      `*`,
      (c, next) => {
        if (!c.req.path.match(/\.(?:part|layout)$/)) {
          const ParentComposed = c.getLayout() as typeof Layout | null;
          const Composed = ParentComposed && Layout
            ? (({ children }: { children?: JSXChildren }) =>
              jsx(ParentComposed, {
                children: jsx(
                  "cc-route",
                  {
                    path: routePath(c),
                    children: jsx(Layout, { ...c.req.param(), children }),
                  },
                ),
              }))
            : ParentComposed ?? Layout;
          if (Composed) c.setLayout(Composed);
        }

        return next();
      },
    );

    app.get(`.layout`, (c) =>
      c.body(
        renderToStream(
          jsx("cc-route", {
            path: routePath(c),
            children: jsx(Layout, {
              children: jsx("cc-route", { children: jsx("progress") }),
            }),
          }),
          { context: c.get(jsxContextSymbol) },
        ),
        { headers: { "Content-Type": "text/html; charset=UTF-8" } },
      ));
  }

  if (Part) {
    const route = (c: Context<E, P>) =>
      jsx("cc-route", {
        path: routePath(c),
        children: jsx(Part, c.req.param() as never),
      });

    app.get("/", (c) => {
      const Composed = c.getLayout()!;
      return c.body(
        renderToStream(
          jsx(Composed, { children: route(c) }),
          { context: c.get(jsxContextSymbol) },
        ),
        { headers: { "Content-Type": "text/html; charset=UTF-8" } },
      );
    });

    app.get(`.part`, (c) =>
      c.body(
        renderToStream(route(c), { context: c.get(jsxContextSymbol) }),
        { headers: { "Content-Type": "text/html; charset=UTF-8" } },
      ));
  }

  return app;
};

type FakePath<P> = P extends
  [infer H extends string, ...infer T extends string[]] ? `/:${H}${FakePath<T>}`
  : ``;

// https://www.hacklewayne.com/typescript-convert-union-to-tuple-array-yes-but-how
type Contra<T> = T extends any ? (arg: T) => void
  : never;

type InferContra<T> = [T] extends [(arg: infer I) => void] ? I
  : never;

type PickOne<T> = InferContra<InferContra<Contra<Contra<T>>>>;

type Union2Tuple<T> = PickOne<T> extends infer U
  ? Exclude<T, U> extends never ? [T]
  : [...Union2Tuple<Exclude<T, U>>, U]
  : never;
