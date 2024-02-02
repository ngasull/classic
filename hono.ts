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

  const layoutRoutes: Record<string, JSX.Component> = Object.fromEntries(
    routeEntries.flatMap(([path, route]) =>
      typeof route === "function"
        ? [[path, route]]
        : route.layout
        ? [[path, route.layout]]
        : []
    ),
  );
  const indexRoutes: Record<string, JSX.Component> = Object.fromEntries(
    routeEntries.flatMap(([path, route]) =>
      typeof route === "function"
        ? [[path, route]]
        : route.index
        ? [[path, route.index]]
        : []
    ),
  );

  const handleRoute = (
    routePath: keyof typeof indexRoutes | keyof typeof layoutRoutes,
    Layout?: JSX.Component | null,
    Index?: JSX.Component | null,
    status = 200,
  ) =>
  async (c: Context) => {
    const isLayout = c.req.query("_layout") != null;
    const isIndex = c.req.query("_index") != null;

    const element = isLayout
      ? Layout
        ? jsx("div", {
          "data-route": "/" + routePath.split("/").pop(),
          children: jsx(Layout, null),
        })
        : jsx("progress", { "data-route": "" })
      : Index &&
        (isIndex
          ? jsx("div", { "data-route": "/", children: jsx(Index, null) })
          : (() => {
            const segments = routePath.split("/");
            const layoutPaths = segments.map((_, i) =>
              segments.slice(0, i + 1).join("/")
            );
            const layoutComponents: JSX.Component[] = layoutPaths.map(
              (path) =>
                layoutRoutes[path] ||
                (({ children }) => Fragment({ children })),
            );

            return layoutComponents.reduceRight(
              (prev, SegmentLayout, i) =>
                jsx(SegmentLayout, {
                  children: jsx("div", {
                    "data-route": "/" + (segments[i + 1] || ""),
                    children: prev,
                  }),
                }),
              jsx(Index, null),
            );
          })());

    c.status(status);

    return element
      ? c.html(await renderToString(element, { domPath }))
      : c.text("Not found", 404);
  };

  for (const [path, Index] of Object.entries(indexRoutes)) {
    hono.get(
      path,
      handleRoute(path as keyof typeof indexRoutes, layoutRoutes[path], Index),
    );
  }

  for (const [path, Layout] of Object.entries(layoutRoutes)) {
    hono.get(path, handleRoute(path, Layout, null));
  }

  hono.get(
    "*",
    handleRoute("", null, () => Fragment({ children: "Not found" }), 404),
  );
};

export const serveBundle = (app: Hono, webBundle: WebBundle) =>
  app.get("/m/:filename{.+}", (c) => {
    const { filename } = c.req.param();

    const bundle = webBundle[`/${filename}`];
    if (!bundle) return c.text("Not found", 404);

    const { contents } = bundle;

    c.header("Content-Type", "text/javascript");
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
