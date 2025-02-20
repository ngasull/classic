import { RegExpRouter } from "@hono/hono/router/reg-exp-router";
import { exists } from "@std/fs/exists";
import { join } from "@std/path";
import {
  $asset,
  type Asset,
  type HandlerParam,
  type RequestMapping,
} from "./build.ts";
import { BaseContext } from "./context.ts";
import { Key } from "./key.ts";
import type { Async } from "./mod.ts";
import {
  type Stringifiable,
  stringify,
  type StringifyOpts,
} from "../js/stringify.ts";

const noop = () => {};
const asyncNoop = async () => {};

export type Middleware<Params = Record<never, string>> = (
  ctx: MiddlewareContext<Params>,
) => Async<Response | void>;

export enum AssetKind {
  JS = 0,
  BYTES = 1,
  STRING = 2,
}

export class ClassicRuntime {
  constructor(mappings: RequestMapping[]) {
    this.#mappings = mappings;

    this.#router = new RegExpRouter();
    for (const [method, ...target] of mappings) {
      const pattern = target[0];
      console.debug("Add", method, ...target);
      this.#router.add(method, pattern, target);
    }
  }

  readonly #mappings: RequestMapping[];
  readonly #router: RegExpRouter<[string, string, ...Readonly<HandlerParam>[]]>;

  readonly fetch = async (req: Request): Promise<Response> => {
    const ctx = new MiddlewareContext<Record<never, string>>(
      asyncNoop,
      this,
      req,
    );

    const [matches, stash] = this.#router.match(req.method, ctx.url.pathname);

    ctx.provide($runtime, this);

    const mws = matches.map(
      ([[pattern, module, ...params], urlParamsIndices]): Middleware => {
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
        return async (ctx) => {
          const mw = await modQ;
          ctx.provide($matchedPattern, pattern);
          ctx.provide($urlGroups, urlParams);
          return mw(ctx);
        };
      },
    );

    return await chainMiddlewares(...mws)(ctx) ??
      new Response(`Not found`, { status: 404 });
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

    const assetIndices = new Map<Asset, number>();
    let assetsToWrite: Asset[] = [];
    const strigifyAssetOpts: StringifyOpts = {
      replace: {
        [$asset]: (asset: Asset) => {
          let assetIndex = assetIndices.get(asset);
          if (assetIndex == null) {
            assetIndices.set(asset, assetIndex = assetIndices.size);
            assetsToWrite.push(asset);
          }
          return asset.hint == null
            ? `c.asset(${assetIndex})`
            : `c.asset(${assetIndex},${JSON.stringify(asset.hint)})`;
        },
      },
    };

    // Generate handlers to track their assets
    const meta = stringify(this.#mappings as Stringifiable, strigifyAssetOpts);

    const assetKeys = new Set<string>();
    const assetsMeta: Array<readonly [AssetKind, string]> = [];
    while (assetsToWrite.length > 0) {
      const batch = assetsToWrite;
      assetsToWrite = [];

      assetsMeta.push(
        ...await Promise.all(batch.map(async (asset, i) => {
          const contents = await asset.contents();

          const makeKey = (suffix?: string) => {
            const index = assetsMeta.length + i;
            const hint = asset.hint ?? index.toString();

            let h = null;
            let key: string;
            do {
              key = h == null ? hint : hint + h++;
              if (suffix != null) key = key + suffix;
            } while (assetKeys.has(key));

            assetKeys.add(key);
            return key;
          };

          if (contents != null && contents instanceof Uint8Array) {
            const key = makeKey();
            await Deno.writeFile(join(assetsDir, key), contents);
            return [AssetKind.BYTES, key] as const;
          } else if (typeof contents === "string") {
            const key = makeKey();
            await Deno.writeTextFile(join(assetsDir, key), contents);
            return [AssetKind.STRING, key] as const;
          } else {
            const key = makeKey(".js");
            await Deno.writeTextFile(
              join(assetsDir, key),
              `export default (c)=>(${
                stringify(contents, strigifyAssetOpts)
              });`,
            );
            return [AssetKind.JS, key] as const;
          }
        })),
      );
    }

    await Deno.writeTextFile(
      join(buildDirectory, "server.js"),
      `import { ClassicRuntime, PrebuildContext } from ${
        JSON.stringify(import.meta.resolve("./prebuilt.ts"))
      };
const c = new PrebuildContext(import.meta.dirname, ${stringify(assetsMeta)});
export default new ClassicRuntime(${meta});
`,
    );
  }
}

export const $runtime = new Key<ClassicRuntime>("runtime");
const $urlGroups = new Key<Record<string, string>>("urlGroups");
const $matchedPattern = new Key<string>("matchedPattern");

export class ClassicRequest<Params> extends BaseContext {
  constructor(runtime: ClassicRuntime, req: Request);
  constructor(context: ClassicRequest<unknown>);
  // deno-lint-ignore constructor-super
  constructor(
    runtimeOrCtx: ClassicRuntime | ClassicRequest<unknown>,
    req?: Request,
  ) {
    if (runtimeOrCtx instanceof ClassicRequest) {
      super(runtimeOrCtx);
      this.#runtime = runtimeOrCtx.#runtime;
      this.#request = runtimeOrCtx.#request;
    } else {
      super();
      this.#runtime = runtimeOrCtx;
      this.#request = req!;
    }
  }

  readonly #runtime: ClassicRuntime;
  get runtime(): ClassicRuntime {
    return this.#runtime;
  }

  readonly #request: Request;
  get request() {
    return this.#request;
  }

  get groups(): Readonly<Params> {
    return this.use($urlGroups) as Readonly<Params>;
  }

  get matchedPattern(): string {
    return this.use($matchedPattern);
  }
}

export class MiddlewareContext<Params> extends ClassicRequest<Params> {
  constructor(
    handle: Middleware<Params>,
    runtime: ClassicRuntime,
    req: Request,
  );
  constructor(
    handle: Middleware<Params>,
    runtime: MiddlewareContext<unknown>,
  );
  constructor(
    handle: Middleware<Params>,
    runtimeOrCtx: ClassicRuntime | ClassicRequest<unknown>,
    req?: Request,
  ) {
    // @ts-ignore TS won't infer this because constructor is overloaded
    super(runtimeOrCtx, req);
    this.#next = handle;
  }

  readonly #next: Middleware<Params>;

  async next(): Promise<Response | void> {
    return this.#next(this);
  }

  #url?: URL;
  get url() {
    return this.#url ??= new URL(this.request.url);
  }
}

export const chainMiddlewares = <Params>(
  ...middlewares: Middleware<Params>[]
): Middleware<Params> =>
  //@ts-ignore Goal is to provide type safety from the outside
  middlewares.reduceRight<Middleware<Params>>(
    (next, p) => (parent) =>
      p(new MiddlewareContext(next, parent as MiddlewareContext<unknown>)),
    noop,
  );
