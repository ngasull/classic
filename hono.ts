import type { Context, Env, Hono, ParamKeys, Schema } from "./deps/hono.ts";
import { renderToString } from "./jsx/render.ts";
import { Fragment, jsx } from "./jsx-runtime.ts";
import { WebBundle } from "./js/web.ts";

export type Routes<KS extends string> = { [Path in KS]: Route<Path> };

export type Route<Path> = JSX.Component<{ [K in ParamKeys<Path>]: string }> | {
  layout?: JSX.Component<
    { children: JSX.Children } & { [K in ParamKeys<Path>]: string }
  >;
  index?: JSX.Component<{ [K in ParamKeys<Path>]: string }>;
};

export const routes = <KS extends string>(def: Routes<KS>) => def;

export const serveRoutes = <
  E extends Env,
  S extends Schema,
  BasePath extends string,
  KS extends string,
>(
  { hono, routes, domPath }: {
    hono: Hono<E, S, BasePath>;
    routes: Routes<KS>;
    domPath: string;
  },
) => {
  const routeEntries = Object.entries(routes) as [string, Route<string>][];
  for (const e of routeEntries) {
    if (e[0] === "/") e[0] = "";
  }

  const handleRoute = <K extends KS>(
    routePath: "" | K,
    Layout?:
      | JSX.Component<
        { children: JSX.Children } & { [k in ParamKeys<K>]: string }
      >
      | null,
    Index: JSX.Component<{ [k in ParamKeys<K>]: string }> = NotFound,
  ) =>
  async (c: Context<E, ParamKeys<K>>) => {
    const params = c.req.param() as Record<ParamKeys<K>, string>;

    const isLayout = c.req.query("_layout") != null;
    const isIndex = c.req.query("_index") != null;

    const element = isLayout
      ? Layout
        ? jsx("div", {
          "data-route": "/" + routePath.split("/").pop(),
          children: jsx(Layout, { ...params, children: undefined }),
        })
        : jsx("progress", { "data-route": "" })
      : (isIndex
        ? jsx("div", { "data-route": "/", children: jsx(Index, null) })
        : (() => {
          const segments = routePath.split("/");
          const layoutPaths = segments.map((_, i) =>
            segments.slice(0, i + 1).join("/")
          ) as K[];
          const layoutComponents: JSX.Component<
            { children: JSX.Children } & { [k in ParamKeys<K>]: string }
          >[] = layoutPaths.map(
            (path) =>
              extractRoute(routes[path])[0] ||
              (({ children }) => Fragment({ children })),
          );

          return layoutComponents.reduceRight(
            (prev, SegmentLayout, i) =>
              jsx(SegmentLayout, {
                ...params,
                children: jsx("div", {
                  "data-route": "/" + (segments[i + 1] || ""),
                  children: prev,
                }),
              }),
            jsx(Index, params),
          );
        })());

    return c.html(
      await renderToString(element, { domPath }),
      Index === NotFound ? 404 : 200,
    );
  };

  for (const [path, route] of Object.entries(routes) as [KS, Route<KS>][]) {
    const [Layout, Index] = extractRoute(route);
    hono.get(
      path,
      handleRoute(path as keyof typeof routes, Layout, Index),
    );
  }

  hono.get("*", handleRoute(""));
};

const extractRoute = <K extends string>(
  route: Route<K>,
): [
  | JSX.Component<{ children: JSX.Children } & { [k in ParamKeys<K>]: string }>
  | undefined,
  JSX.Component<{ [k in ParamKeys<K>]: string }> | undefined,
] =>
  typeof route === "function"
    ? [undefined, route]
    : [route.layout, route.index];

const NotFound = () => Fragment({ children: "Not found" });

export const serveBundle = (app: Hono, webBundle: WebBundle) =>
  app.get("/m/:filename{.+}", (c) => {
    const { filename } = c.req.param();

    const bundle = webBundle[`/${filename}`];
    if (!bundle) return c.text("Not found", 404);

    const { contents } = bundle;

    c.header("Content-Type", "text/javascript; charset=UTF-8");
    return c.body(contents);
  });

export const HTMLRoot = ({ lang, title }: {
  lang?: string;
  title?: string;
}) => {
  return jsx("html", {
    lang,
    children: [
      jsx("head", {
        children: [
          title ? jsx("title", { children: title }) : null,
          jsx("meta", { charset: "utf-8" }),
          jsx("meta", {
            name: "viewport",
            content: "width=device-width, initial-scale=1",
          }),
        ],
      }),
      jsx("body", { children: [] }),
    ],
  });
};
