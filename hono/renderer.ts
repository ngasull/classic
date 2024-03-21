import type {
  ContextVariableMap,
  Env,
  Input,
  MiddlewareHandler,
  ParamKeys,
} from "../deps/hono.ts";
import type { Bundle } from "../js/bundle.ts";
import type { JS } from "../js/types.ts";
import { jsx } from "../jsx-runtime.ts";
import { bundleContext, createContext, renderToStream } from "../jsx/render.ts";
import {
  JSXChildren,
  JSXComponent,
  JSXInitContext,
  JSXParentComponent,
} from "../jsx/types.ts";

declare module "../deps/hono.ts" {
  interface ContextRenderer {
    (content: JSX.Element): Response | Promise<Response>;
  }
  interface ContextVariableMap {
    readonly [domRouterSymbol]: JS<typeof import("../dom/router.ts")>;
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

export const jsxRenderer = <
  E extends Env & { Variables: ContextVariableMap },
  P extends string,
  I extends Input,
>(bundle: Bundle): MiddlewareHandler<E, P, I> => {
  const domRouter = bundle.add<typeof import("../dom/router.ts")>(
    import.meta.resolve("../dom/router.ts"),
  );
  const bundleContextValue = bundle.result.then((result) => ({
    result,
    watched: bundle.watched,
  }));

  return async (c, next) => {
    c.set(domRouterSymbol, domRouter);
    c.set(jsxContextSymbol, [
      honoContext(c),
      bundleContext(await bundleContextValue),
    ]);

    c.setRenderer((content: JSX.Element) => {
      const Layout = c.get(layoutSymbol);
      const ComposedLayout = c.get(composedLayoutSymbol);

      if (c.req.query("_layout") != null && !Layout) return c.notFound();

      content = jsx("div", {
        ref: (api) => domRouter.ref(api, c.req.path),
        children: content,
      });

      return c.body(
        renderToStream(
          c.req.query("_layout") != null
            ? jsx(
              Layout!,
              c.req.param() as any,
              jsx("progress", { ref: domRouter.ref }),
            )
            : c.req.query("_index") == null && ComposedLayout
            ? jsx(ComposedLayout, null, content)
            : content,
          { context: c.get(jsxContextSymbol) },
        ),
        { headers: { "Content-Type": "text/html; charset=UTF-8" } },
      );
    });

    await next();

    c.set(jsxContextSymbol, undefined);
  };
};

export const jsxContext =
  (...context: JSXInitContext<unknown>[]): MiddlewareHandler =>
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
  Layout: JSXParentComponent<Record<ParamKeys<P>, string>>,
): MiddlewareHandler<E, P, I> =>
async (c, next) => {
  const { routePath } = c.req;
  const params = c.req.param() as any;

  const domRouter = c.get(domRouterSymbol);
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
            ref: (api) =>
              domRouter.ref(
                api,
                c.req.path.split("/")
                  .slice(0, routePath.replace(/\/\*?$/, "").split("/").length)
                  .join("/"),
              ),
          },
          jsx(
            Layout as JSXParentComponent<Record<string, string>>,
            params,
            children,
          ),
        ),
      ))
    : ParentComposed ?? Layout;

  c.set(composedLayoutSymbol, ComposedLayout as JSXParentComponent);
  c.set(layoutSymbol, Layout as JSXParentComponent);

  await next();

  c.set(layoutSymbol, ParentLayout);
  c.set(composedLayoutSymbol, ParentComposed);
};

export const route = <K extends string, I extends Input>(
  Index: JSXComponent<Record<K, string>>,
): MiddlewareHandler<
  Env & { Variables: ContextVariableMap },
  FakePath<Union2Tuple<K>>,
  I
> =>
(c) => Promise.resolve(c.render(jsx(Index, c.req.param() as any)));

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
