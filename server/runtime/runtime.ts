import { Context } from "@classic/context";
import { type Stringifiable, stringify } from "@classic/js/stringify";
import { RegExpRouter } from "@hono/hono/router/reg-exp-router";
import { exists } from "@std/fs/exists";
import { join } from "@std/path/join";
import { toFileUrl } from "@std/path/to-file-url";
import { Asset, AssetKind, writeAssets } from "../build/asset.ts";
import type { Async } from "../build/mod.ts";
import {
  $request,
  $requestPattern,
  ClassicRequest,
  type Middleware,
  RequestPattern,
  runMiddlewares,
  type TypedRequest,
} from "./request.ts";

export type Method = "GET" | "POST" | "DELETE" | "PATCH" | "PUT";

export type HandlerParam = Stringifiable | undefined;

export class Route {
  constructor(
    public readonly method: Method,
    public readonly pattern: string,
    public readonly module: string,
    public readonly params: Readonly<HandlerParam>[],
  ) {}

  toMeta(): Stringifiable[] {
    return [
      this.method,
      this.pattern,
      this.module,
      this.params,
    ];
  }
}

export interface ClassicServer {
  fetch(req: Request): Promise<Response>;
  write(buildDirectory?: string): Promise<void>;
}

/**
 * Retrieves the active {@linkcode Request} from current context
 */
export const useRequest = <Params>(): TypedRequest<Params> =>
  $request.use().request as TypedRequest<Params>;

/**
 * Fetch a {@linkcode Response} in current server's context
 *
 * @param req The {@linkcode Request} to send
 */
export const useFetch = (req: Request): Promise<Response> =>
  $request.use().server.fetch(req);

/**
 * Redirects to requested path, preferrably softly when
 * current request comes from classic router.
 *
 * @param pathname The from which to send the {@linkcode Response}
 */
export const useRedirect = async (pathname: string): Promise<Response> => {
  const req = useRequest();
  const isClassicRoute = req.headers.has("Classic-Route");
  const contentLocation = new URL(pathname, req.url);

  return isClassicRoute
    ? useFetch(new Request(contentLocation))
    : Response.redirect(contentLocation);
};

export class RuntimeServer implements ClassicServer {
  constructor(mappings: readonly Route[]) {
    this.#mappings = mappings;

    this.#router = new RegExpRouter();
    for (const mapping of mappings) {
      const { method, pattern, module, params } = mapping;
      console.debug("Add", method, pattern || "/", module, ...params);
      this.#router.add(method, pattern || "/", mapping);
    }
  }

  readonly #mappings: readonly Route[];
  readonly #router: RegExpRouter<Route>;

  readonly fetch = async (req: Request): Promise<Response> => {
    const ctx = new ClassicRequest(this, req as TypedRequest<unknown>);

    const [matches, stash] = this.#router.match(
      req.method,
      new URL(req.url).pathname,
    );

    const middlewares = matches.map(
      ([{ pattern, module, params }, urlParamsIndices]): Middleware => {
        const modQ = import(module).then((
          mod: {
            default: (...meta: Readonly<HandlerParam>[]) => Async<Middleware>;
          },
        ) => mod.default(...params));

        const urlParams = Object.freeze(
          stash
            ? Object.fromEntries(
              Object.entries(urlParamsIndices).map(([k, i]) => [k, stash[i]]),
            )
            : {},
        );
        return async (req) => {
          const mw = await modQ;
          return $requestPattern.provide(
            new RequestPattern(urlParams, pattern),
            mw,
            req,
          );
        };
      },
    );

    return $request.provide(ctx, () => runMiddlewares(middlewares, req));
  };

  async write(
    buildDirectory: string = join(Deno.cwd(), ".build"),
  ): Promise<void> {
    if (await exists(buildDirectory)) {
      throw Error(
        `Build directory already exists, specify another or remove first: ${buildDirectory}`,
      );
    }

    const assetsDir = join(buildDirectory, "asset");
    await Deno.mkdir(assetsDir, { recursive: true });

    // Generate handlers to track their assets
    const [meta, assetsMeta] = await writeAssets(
      this.#mappings.map((r) => r.toMeta()),
      assetsDir,
    );

    await Deno.writeTextFile(
      join(buildDirectory, "server.js"),
      `import { PrebuildContext, RuntimeServer, Route } from ${
        JSON.stringify(import.meta.url)
      };
const c = new PrebuildContext(import.meta.dirname, ${stringify(assetsMeta)});
export default new RuntimeServer(${meta}.map(r => new Route(...r)));
`,
    );
  }
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

export const $buildRestore = Context.for<
  () => Stringifiable
>("classic.buildRestore");

/**
 * Provides prebuilt data restoration logic to a server
 *
 * @param restore Function that returns next prebuilt data
 * @param cb Arbitrary closure
 * @params args `cb`'s arguments
 */
export const restoreBuild = <Args extends unknown[], R>(
  restore: () => Stringifiable,
  cb: (...args: Args) => R,
  ...args: Args
): R => $buildRestore.provide(restore, cb, ...args);
