import type { Stringifiable } from "@classic/js/stringify";
import { RegExpRouter } from "@hono/hono/router/reg-exp-router";
import { join } from "@std/path/join";
import { toFileUrl } from "@std/path/to-file-url";
import { Asset, AssetKind } from "./asset.ts";
import {
  $moduleRequest,
  ClassicRequest,
  type Middleware,
  ModuleRequest,
  runMiddlewares,
  type TypedRequest,
} from "./request.ts";
import { type HandlerResult, isBuildable, type Route } from "./module.ts";

/**
 * Fetch a {@linkcode Response} in current server's context
 *
 * @param req The {@linkcode Request} to send
 */
export const useFetch = (req: Request): Promise<Response> =>
  $moduleRequest.use().request.server.fetch(req);

/**
 * Redirects to requested path, preferrably softly when
 * current request comes from classic router.
 *
 * @param pathname The from which to send the {@linkcode Response}
 */
export const useRedirect = async (pathname: string): Promise<Response> => {
  const req = $moduleRequest.use().request.request;
  const isClassicRoute = req.headers.has("Classic-Route");
  const contentLocation = new URL(pathname, req.url);

  return isClassicRoute
    ? useFetch(new Request(contentLocation))
    : Response.redirect(contentLocation);
};

export interface ClassicServer {
  fetch(req: Request): Promise<Response>;
}

export class RuntimeServer implements ClassicServer {
  readonly #router: RegExpRouter<Route>;

  constructor(mappings: readonly Route[]) {
    this.#router = new RegExpRouter();
    for (const mapping of mappings) {
      const { method, pattern, module, exportName, params } = mapping;
      console.debug(
        "Add",
        method,
        pattern || "/",
        module,
        exportName,
        ...params ?? [],
      );
      this.#router.add(
        method === "*" ? "ALL" : method,
        pattern || "/",
        mapping,
      );
    }
  }

  readonly fetch = async (req: Request): Promise<Response> => {
    const request = new ClassicRequest(this, req as TypedRequest<unknown>);

    const [matches, stash] = this.#router.match(
      req.method,
      new URL(req.url).pathname,
    );

    const middlewares = matches.map(([
      { pattern, module, exportName, params },
      urlParamsIndices,
    ]): Middleware => {
      const exported = module.module[exportName];

      let handler: (...args: Stringifiable[]) => HandlerResult;
      if (isBuildable(exported)) {
        handler = exported.handle.bind(exported);
      } else if (typeof exported === "function") {
        handler = exported as typeof handler;
      } else {
        throw Error(
          `Routed module export is neither built nor handler function: ${exportName} in ${module.url.href}`,
        );
      }

      const urlParams = Object.freeze(
        stash
          ? Object.fromEntries(
            Object.entries(urlParamsIndices).map(([k, i]) => [k, stash[i]]),
          )
          : {},
      );
      return async () =>
        $moduleRequest.provide(
          new ModuleRequest(this, module, request, urlParams, pattern),
          handler,
          ...params,
        );
    });

    return runMiddlewares(middlewares, req);
  };
}

export class PrebuildContext {
  constructor(buildDirectory: string, assets: [AssetKind, string][]) {
    this.#buildDirectory = buildDirectory;
    this.#assets = assets;
  }

  readonly #buildDirectory: string;
  readonly #assets: [AssetKind, string][];

  asset(index: number): Asset {
    return new Asset(async () => {
      const asset = this.#assets[index];
      if (!asset) throw Error(`Assets have not been prebuilt correctly`);

      const [kind, key] = asset;
      switch (kind) {
        case AssetKind.JS: {
          const mod = await import(
            toFileUrl(join(this.#buildDirectory, "asset", key)).href
          );
          return mod.default(this);
        }
        case AssetKind.STRING:
          return Deno.readTextFile(
            join(this.#buildDirectory, "asset", key),
          );
        default:
          return Deno.readFile(join(this.#buildDirectory, "asset", key));
      }
    });
  }
}
