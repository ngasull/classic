import { create as createHash } from "@jabr/xxhash64";
import { encodeBase64 } from "@std/encoding";
import { exists } from "@std/fs";
import { accepts } from "@std/http";
import { join, resolve, toFileUrl } from "@std/path";
import { RegExpRouter } from "hono/router/reg-exp-router";
import { transform as transformCss } from "lightningcss";
import {
  isJsx,
  type JSX,
  type JSXContextInit,
  type JSXElement,
} from "./types.ts";
import { initContext, render } from "./render.ts";
import { jsx } from "./jsx-runtime.ts";
import { $addCss, Shadow } from "./component.ts";

type RouteModule<
  Params extends string,
  Data,
  Mutations extends string,
  Children extends Record<string, RouteApi<string, unknown, string, any>>,
> = {
  default?: RouteApi<Params, Data, Mutations, Children>;
};

type RouteApiDefinition<
  Params extends string,
  Data,
  Mutations extends string,
  CParams extends string,
  Children extends {
    [P in CParams]: P extends string
      ? RouteApiDefinition<AsRouteParam<P>, unknown, string, string, any>
      : never;
  },
> =
  & {
    layout?: JSX.PFC<PageProps<Params, Data>> | {
      style?: string;
      render: JSX.PFC<PageProps<Params, Data>>;
    };
    page?: JSX.FC<PageProps<Params, Data>> | {
      style?: string;
      render: JSX.FC<PageProps<Params, Data>>;
    };
    mutation?: Mutation<Params> | { [M in Mutations]: Mutation<Params> };
    children?: Children;
  }
  & {
    [M in typeof httpMethods[number]]?: (ctx: RouteContext<Params>) =>
      | Response
      | JSXElement
      | Data
      | Promise<Response | JSXElement | Data>;
  };

declare const $params: unique symbol;
declare const $data: unique symbol;

type Mutation<Params extends string> = (ctx: RouteContext<Params>) =>
  | Response
  | void
  | Promise<Response | void>;

type RouteApi<
  Params extends string,
  Data,
  Mutations extends string,
  Children extends Record<string, RouteApi<string, unknown, string, any>>,
> =
  & {
    [$params]: Params;
    [$data]: Data;
  }
  & RouteApiDefinition<Params, Data, Mutations, string, Children>;

type RouteContext<Params extends string> = {
  req: Request;
  params: Record<Params, string>;
};

type PageProps<Params extends string, Data> =
  & RouteContext<Params>
  & { data?: Data };

type RoutesMeta = { base: string; root: RouteMeta };

type RouteMeta =
  & {
    mutation?: true | string[];
    children?: Record<string, RouteMeta>;
    layoutCss?: string;
    css?: string[];
    methods?: (typeof httpMethods[number])[];
    staticGETContents?: string;
  }
  & (
    | { path?: never; inline?: never }
    | { path: string; inline?: never }
    | { path?: never; inline: string }
  );

const httpMethods = ["GET", "POST", "DELETE", "PATCH", "PUT"] as const;

type AsParams<Params> = Params extends { [$params]: infer P extends string } ? P
  : string;

type AsChildren<Children> = undefined extends Children
  ? Record<string, RouteApi<string, unknown, string, any>>
  : { [P in keyof Children]: RouteApi<AsRouteParam<P>, unknown, string, any> };

type AsRouteParam<Name extends string | number | symbol> = Name extends
  `[[${infer P}]]` ? P : Name extends `[${infer P}]` ? P : never;

const defineRoute = <
  Params,
  Data,
  Mutations extends string,
  CParams extends string,
  Children extends {
    [P in CParams]: P extends string
      ? RouteApiDefinition<AsRouteParam<P>, unknown, string, string, any>
      : never;
  },
>(
  opts:
    & {
      params?: Params;
      data?: Data;
    }
    & RouteApiDefinition<AsParams<Params>, Data, Mutations, CParams, Children>
    & {
      [M in typeof httpMethods[number]]?: (
        ctx: RouteContext<AsParams<Params>>,
      ) =>
        | Response
        | JSXElement
        | Data
        | Promise<Response | JSXElement | Data>;
    },
): RouteApi<AsParams<Params>, Data, Mutations, AsChildren<Children>> =>
  opts as RouteApi<AsParams<Params>, Data, Mutations, AsChildren<Children>>;

defineRoute.params = <Params extends string>(): {
  [$params]: Params;
} => null!;

defineRoute.data = <Data>(): { [$data]: Data } => null!;

const defineMutation = <Params>(
  mutation: Mutation<keyof Params & string>,
): RouteApi<AsParams<Params>, never, string, never> =>
  ({ mutation }) as unknown as RouteApi<AsParams<Params>, never, string, never>;

export { defineMutation as mutation, defineRoute as route };

export const scanRoutes = async (base: string): Promise<RoutesMeta> => {
  const root: RouteMeta = {};
  await scanDir(base, [], root);
  return { base, root };
};

const routeRegExp = /^(?:(index)|(.+)\.route)\.tsx?$/;

const scanDir = async (
  baseDir: string,
  parentSegments: string[],
  parent: RouteMeta,
) => {
  for await (
    const { isDirectory, name } of Deno.readDir(
      join(baseDir, ...parentSegments),
    )
  ) {
    if (isDirectory) {
      parent.children ??= {};
      await scanDir(
        baseDir,
        [...parentSegments, name],
        parent.children[segmentToURLPattern(name)] ??= {},
      );
    } else {
      const match = name.match(routeRegExp);
      if (match) {
        const [
          ,
          index,
          routeName,
        ] = match as [string, "index", null] | [string, null, string];

        const path = join(...parentSegments, name);
        const cwdFilePath = join(baseDir, path);
        const { default: route }: RouteModule<
          string,
          unknown,
          string,
          Record<string, RouteApi<string, unknown, string, any>>
        > = await import(
          toFileUrl(resolve(cwdFilePath)).href
        );

        if (!route) {
          throw Error(`File ${cwdFilePath} must export a route as default`);
        }

        const cssFileBaseName: string = index ? "index" : `${routeName}.route`;
        const cssFile: string = join(
          baseDir,
          ...parentSegments,
          cssFileBaseName + ".css",
        );
        let styleSheet: string | null = null;

        if (await exists(cssFile, { isFile: true })) {
          const { code, map } = transformCss({
            filename: cssFileBaseName,
            code: await Deno.readFile(cssFile),
            sourceMap: true,
          });

          const cssFileName = `${cssFileBaseName}.${await encodeHash(
            code,
          )}.css`;
          styleSheet = ["", ...parentSegments, cssFileName].join("/");

          parent.children ??= {};
          parent.children["/" + cssFileName] = {
            methods: ["GET"],
            staticGETContents: `${
              decoder.decode(code)
            }\n/*# sourceMappingURL=${cssFileName}.map */\n`,
          };
          if (map) {
            parent.children["/" + cssFileName + ".map"] = {
              methods: ["GET"],
              staticGETContents: decoder.decode(map),
            };
          }
        }

        await addChild(
          baseDir,
          parentSegments,
          routeName,
          path,
          styleSheet,
          route,
          parent as RouteMeta,
        );
      }
    }
  }
};

const addChild = async (
  baseDir: string,
  parentSegments: string[],
  routeName: string | null,
  path: string,
  styleSheet: string | null,
  { page, layout, mutation, children, ...mod }: RouteApi<
    string,
    unknown,
    string,
    Record<string, RouteApi<string, unknown, string, any>>
  >,
  parent: RouteMeta,
) => {
  const segments = routeName == null
    ? parentSegments
    : [...parentSegments, routeName];

  const route = routeName == null ? parent : (
    parent.children ??= {},
      parent.children[segmentToURLPattern(routeName)] ??= path === parent.path
        ? { inline: routeName }
        : {}
  ) as RouteMeta;

  if (!route.inline) {
    if (route.path != null) {
      throw Error(`Duplicate route definition: ${route.path} and ${path}`);
    }
    // We don't want `route.path` to be refined as nullish here
    (route as RouteMeta).path = path;
  }

  if (layout && typeof layout === "object") {
    const cssFileBaseName: string = routeName == null
      ? "indexlayoutinjs"
      : `${routeName}.layoutinjs`;

    const { code, map } = transformCss({
      filename: cssFileBaseName + ".css",
      code: encoder.encode(layout.style),
      sourceMap: true,
    });
    const cssFileName = `${cssFileBaseName}.${await encodeHash(code)}.css`;
    route.layoutCss = ["", ...parentSegments, cssFileName].join("/");

    parent.children ??= {};
    parent.children["/" + cssFileName] = {
      methods: ["GET"],
      staticGETContents: `${
        decoder.decode(code)
      }\n/*# sourceMappingURL=${cssFileName}.map */\n`,
    };
    if (map) {
      parent.children["/" + cssFileName + ".map"] = {
        methods: ["GET"],
        staticGETContents: decoder.decode(map),
      };
    }
  }

  if (page && typeof page === "object") {
    const cssFileBaseName: string = routeName == null
      ? "indexinjs"
      : `${routeName}.injs`;
    const ss = ["", ...parentSegments, cssFileBaseName + ".css"].join("/");
    route.css = styleSheet ? [styleSheet, ss] : [ss];

    const { code, map } = transformCss({
      filename: cssFileBaseName + ".css",
      code: encoder.encode(page.style),
      sourceMap: true,
    });
    const cssFileName = `${cssFileBaseName}.${await encodeHash(code)}.css`;

    parent.children ??= {};
    parent.children["/" + cssFileName] = {
      methods: ["GET"],
      staticGETContents: `${
        decoder.decode(code)
      }\n/*# sourceMappingURL=${cssFileName}.map */\n`,
    };
    if (map) {
      parent.children["/" + cssFileName + ".map"] = {
        methods: ["GET"],
        staticGETContents: decoder.decode(map),
      };
    }
  }

  if (mutation) {
    route.mutation = typeof mutation === "function"
      ? true
      : Object.keys(mutation);
  }

  for (const method of httpMethods) {
    const ms = new Set(route.methods);
    if ((mod[method] || method === "GET" && page)) {
      ms.add(method);
    }
    route.methods = [...ms];
  }

  if (children) {
    await Promise.all(
      Object.entries(children).map(([cname, croute]) =>
        addChild(
          baseDir,
          segments,
          cname,
          path,
          styleSheet,
          croute,
          route,
        )
      ),
    );
  }
};

const segmentToURLPattern = (segment: string) => {
  const param = segment.match(/^\[([^\]]+)\]$/)?.[1];
  const optional = param?.match(/^\[(.+)\]$/)?.[1];
  return param
    ? optional
      ? `{/:${optional}}?`
      : `/:${param}${param.startsWith("...") ? "*" : ""}`
    : `/${segment}`;
};

const staticExtRegExp = /\.css(?:\.map)?$/;

const responseOpts = {
  "": {
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
    },
  },
  ".html": {
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
    },
  },
  ".css": {
    headers: {
      "Content-Type": "text/css; charset=UTF-8",
    },
  },
  ".css.map": {
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
    },
  },
};

export const fileRouter = (
  routes: RoutesMeta,
): (
  req: Request,
  context?: JSXContextInit<unknown>[],
) => Promise<Response | void> => {
  const router = new RegExpRouter<
    (
      req: Request,
      params: never,
      context?: JSXContextInit<unknown>[],
    ) => Response | void | Promise<Response | void>
  >();

  const modPathByRoute = new Map<
    RouteMeta,
    () => Promise<RouteApi<never, never, string, never> | undefined>
  >();
  const getMod = async (route: RouteMeta) => modPathByRoute.get(route)?.();

  const addRoute = (
    parents: RouteMeta[],
    pattern: string,
    route: RouteMeta,
  ) => {
    let ext: string | null;
    const nestedRoutes = [...parents, route];

    const { path, inline, methods, staticGETContents, mutation, children } =
      route;

    if (inline) {
      const parent = parents[parents.length - 1];
      modPathByRoute.set(
        route,
        async () =>
          (await getMod(parent))!
            .children![inline] as RouteApi<never, never, never, never>,
      );
    } else if (path) {
      const modUrl = toFileUrl(resolve(routes.base, path)).href;
      modPathByRoute.set(
        route,
        async () =>
          (await import(modUrl)).default as RouteApi<
            never,
            never,
            never,
            never
          >,
      );
    }

    if (methods) {
      for (const method of methods) {
        router.add(
          method,
          pattern,
          method === "GET" && staticGETContents != null
            ? () => {
              ext ??= pattern.match(staticExtRegExp)?.[0] ?? "";
              return new Response(
                staticGETContents,
                responseOpts[ext as keyof typeof responseOpts],
              );
            }
            : async (req, params, context) => {
              const mod = (await getMod(route))!;
              const ctx: RouteContext<never> = { req, params };
              const acceptsHtml = accepts(req).includes("text/html");
              const use = initContext(context);

              if (method === "GET" && mod.page && (acceptsHtml || !mod.GET)) {
                return respondPage(nestedRoutes, ctx, use);
              } else {
                const res = await mod[method]!(ctx);
                if (res == null || res instanceof Response) {
                  return res;
                } else if (isJsx(res)) {
                  return respondHtml(res, use);
                } else if (acceptsHtml && mod.page) {
                  return respondPage(nestedRoutes, { ...ctx, data: res }, use);
                } else {
                  return Response.json(res);
                }
              }
            },
        );
      }
    }

    if (mutation) {
      for (const name of mutation === true ? [""] : mutation) {
        router.add(
          "POST",
          name ? `${pattern}/${name}` : pattern,
          async (req, params, context) => {
            const mod = (await getMod(route))!;
            const url = new URL(req.url);
            const rawLocation = url.searchParams.get("location");
            const requestedLocation = rawLocation
              ? new URL(rawLocation, url.origin)
              : null;

            const modMutation = mutation === true
              ? mod.mutation as Mutation<string>
              : (mod.mutation as Record<string, Mutation<string>>)[name];

            const res = await modMutation({ req, params });
            if (res instanceof Response) {
              return res;
            } else if (
              requestedLocation && requestedLocation?.pathname !== url.pathname
            ) {
              const res = await handleRequest(
                new Request(requestedLocation, { headers: req.headers }),
                context,
              );
              res?.headers.set("Content-Location", requestedLocation.pathname);
              return res;
            } else {
              return new Response();
            }
          },
        );
      }
    }

    if (children) {
      for (const [subPattern, child] of Object.entries(children)) {
        addRoute(nestedRoutes, pattern + subPattern, child);
      }
    }
  };

  const respondPage = async (
    nestedRoutes: RouteMeta[],
    props: PageProps<never, never>,
    use: JSX.Use,
  ) => {
    const { data: _, ...ctx } = props;

    const layouts = (await Promise.all(nestedRoutes.map(async (r) => {
      const mod = await getMod(r);
      return mod?.layout == null ? null : [r, fromStylable(mod.layout)];
    }))).filter(Boolean) as [RouteMeta, JSX.PFC<PageProps<never, unknown>>][];

    const route = nestedRoutes[nestedRoutes.length - 1];
    const mod = (await getMod(route))!;
    const page = fromStylable(mod.page!);

    if (route.css) {
      for (const s of route.css) use($addCss, s);
    }

    return respondHtml(
      layouts.reduceRight(
        (children, [layout, Layout], i) =>
          i === 0 ? jsx(Layout, { ...ctx, children }) : jsx("div", {
            children: [
              jsx(Shadow, {
                children: [
                  layout.layoutCss
                    ? jsx("link", {
                      rel: "stylesheet",
                      href: layout.layoutCss,
                    })
                    : null,
                  jsx(Layout, { ...ctx, children: jsx("slot") }),
                ],
              }),
              children,
            ],
          }),
        jsx(page, props),
      ),
      use,
    );
  };

  addRoute([], "", routes.root);

  const handleRequest: ReturnType<typeof fileRouter> = async (req, context) => {
    const url = new URL(req.url);
    const [[firstMatch], stash] = router.match(req.method, url.pathname);
    if (firstMatch) {
      return firstMatch[0](
        req,
        (stash
          ? Object.fromEntries(
            Object.entries(firstMatch[1]).map(([k, i]) => [k, stash[i]]),
          )
          : {}) as never,
        context,
      );
    }
  };

  return handleRequest;
};

const fromStylable = <Props extends Record<string, unknown>>(
  page: JSX.FC<Props> | { style?: string; render: JSX.FC<Props> },
): JSX.FC<Props> => typeof page === "function" ? page : page.render;

const respondHtml = (
  el: JSX.Element,
  context?: JSX.Use | JSXContextInit<unknown>[],
) => new Response(render(el, { context }), responseOpts[".html"]);

const encoder = new TextEncoder();

const decoder = new TextDecoder();

const encodeHash = async (data: Uint8Array) => {
  const hasher = await createHash();
  hasher.update(data);
  return encodeBase64(hasher.digest() as Uint8Array);
};
