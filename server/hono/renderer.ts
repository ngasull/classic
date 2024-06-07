import type {
  ContextVariableMap,
  Env,
  Input,
  MiddlewareHandler,
  ParamKeys,
} from "../../deps/hono.ts";
import type { ClassicBundle } from "classic/element/serve";
import type { JS } from "classic/js";
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

declare module "../../deps/hono.ts" {
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

export const classicRouter = <
  E extends Env & { Variables: ContextVariableMap },
  P extends string,
  I extends Input,
>(): MiddlewareHandler<E, P, I> =>
(c, next) => {
  c.setRenderer((content: JSX.Element) => {
    const Layout = c.get(layoutSymbol);
    const ComposedLayout = c.get(composedLayoutSymbol);

    if (c.req.query("_layout") != null && !Layout) return c.notFound();

    content = jsx("cc-route", {
      path: c.req.path,
      children: content,
    });

    const layoutEl = c.req.query("_layout") != null &&
      jsx(
        Layout!,
        c.req.param() as any,
        jsx("cc-route", { children: jsx("progress") }),
      );

    const fullPageEl = !layoutEl &&
      c.req.query("_index") == null &&
      ComposedLayout &&
      jsx(ComposedLayout, { children: content });

    const headers: HeadersInit = { "Content-Type": "text/html; charset=UTF-8" };
    if (!fullPageEl) headers.Partial = "1";

    return c.body(
      renderToStream(layoutEl || fullPageEl || content, {
        context: c.get(jsxContextSymbol),
      }),
      { headers },
    );
  });

  return jsxContext(honoContext(c))(c, next);
};

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

  const ParentLayout = c.get(layoutSymbol);
  const ParentComposed = c.get(composedLayoutSymbol);
  const ComposedLayout = ParentComposed && Layout
    ? (({ children }: { children?: JSXChildren }) =>
      jsx(
        ParentComposed,
        null,
        jsx(
          "cc-route",
          {
            path: c.req.path.split("/").slice(
              0,
              routePath.replace(/\/\*?$/, "").split("/").length,
            ).join("/"),
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
(c) => c.render(jsx(Index, c.req.param() as any)) as Promise<Response>;

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
