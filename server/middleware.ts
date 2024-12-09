import { RegExpRouter } from "hono/router/reg-exp-router";
import { join } from "@std/path";
import type { BuildMeta, HandlerParam, RequestMapping } from "./build.ts";
import { Context } from "./context.ts";

const noop = () => {};
const asyncNoop = async () => {};

type Async<T> = T | PromiseLike<T>;

export type Middleware<Params = Record<never, string>> = (
  ctx: RequestContextAPI<Params>,
) => Async<Response | void>;

export class RuntimeContext {
  constructor(
    mappings: RequestMapping[],
    assets: Record<string, () => Async<string | Uint8Array>>,
  ) {
    this.#mappings = mappings;
    this.#assets = assets;

    this.#router = new RegExpRouter();
    for (const [method, pattern, ...target] of mappings) {
      console.debug("Add", method, pattern, ...target);
      this.#router.add(method, pattern, target);
    }
  }

  readonly #mappings: RequestMapping[];
  readonly #assets: Record<string, () => Async<string | Uint8Array>>;
  readonly #router: RegExpRouter<[string, ...HandlerParam[]]>;

  readonly handle = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const [matches, stash] = this.#router.match(req.method, url.pathname);

    const rootCtx = new RequestContext<Record<never, string>>(
      asyncNoop,
      this,
      req,
    );

    rootCtx.provide(
      $path,
      Object.freeze(
        url.pathname
          .split("/")
          .map(decodeURIComponent),
      ),
    );

    rootCtx.provide($runtime, this);

    const mws = matches.map(
      ([[module, ...params], urlParamsIndices]): Middleware => {
        const modQ: Promise<{
          default: (...meta: Readonly<HandlerParam>[]) => Middleware;
        }> = import(module);
        const urlParams = Object.freeze(
          stash
            ? Object.fromEntries(
              Object.entries(urlParamsIndices).map(([k, i]) => [k, stash[i]]),
            )
            : {},
        );
        return async (ctx) => {
          const mod = await modQ;
          ctx.provide($urlGroups, urlParams);
          return mod.default(...params)(ctx);
        };
      },
    );

    return await chainMiddlewares(...mws)(rootCtx) ??
      new Response(`Not found`, { status: 404 });
  };

  async asset(key: string): Promise<string | Uint8Array> {
    const asset = this.#assets[key];
    if (!asset) throw Error(`No built asset named ${key}`);
    return asset();
  }

  async write(
    buildDirectory: string = join(Deno.cwd(), ".build"),
  ): Promise<void> {
    const assetsDirectory = join(buildDirectory, "asset");
    const meta: BuildMeta = {
      mappings: this.#mappings,
      assets: Object.keys(this.#assets),
    };

    await Promise.all([
      Deno.writeTextFile(
        join(buildDirectory, "meta.json"),
        JSON.stringify(meta),
      ),
      ...Object.entries(this.#assets).map(async ([key, getContents]) => {
        const contents = await getContents();
        return typeof contents === "string"
          ? Deno.writeTextFile(join(assetsDirectory, key), contents)
          : Deno.writeFile(join(assetsDirectory, key), contents);
      }),
    ]);
  }

  static async read(
    buildDirectory: string = join(Deno.cwd(), ".build"),
  ): Promise<RuntimeContext> {
    const meta: BuildMeta = await import(join(buildDirectory, "meta.json"), {
      with: { type: "json" },
    });
    return new RuntimeContext(
      meta.mappings,
      new Proxy({} as Record<string, () => Promise<Uint8Array>>, {
        get: (assets, key: string) =>
          assets[key] ??= () =>
            Deno.readFile(join(buildDirectory, "asset", key)),
      }),
    );
  }
}

export const load = (buildDirectory?: string): Promise<RuntimeContext> =>
  RuntimeContext.read(buildDirectory);

export type RequestContextAPI<Params = Record<never, string>> = Omit<
  RequestContext<Params>,
  "new"
>;

export const $runtime = Context.key<RuntimeContext>("runtime");
const $urlGroups = Context.key<Record<string, string>>("urlGroups");
const $path = Context.key<readonly string[]>("path");
const $currentPath = Context.key<readonly string[]>("currentPath");

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class RequestContext<Params> extends Context {
  constructor(
    handle: Middleware<Params>,
    runtime: RuntimeContext,
    req: Request,
  );
  constructor(
    handle: Middleware<Params>,
    runtime: RequestContext<unknown>,
  );
  // deno-lint-ignore constructor-super
  constructor(
    handle: Middleware<Params>,
    runtime: RuntimeContext | RequestContext<unknown>,
    req?: Request,
  ) {
    if (runtime instanceof RequestContext) {
      super(runtime);
      this.#runtime = runtime.#runtime;
      this.#request = runtime.#request;
    } else {
      super();
      this.#runtime = runtime;
      this.#request = req!;
    }
    this.#next = handle;
  }

  readonly #next: Middleware<Params>;
  readonly #runtime: RuntimeContext;
  readonly #request: Request;

  get request() {
    return this.#request;
  }

  async next(): Promise<Response | void> {
    return this.#next(this);
  }

  async asset(key: string): Promise<Uint8Array> {
    const asset = await this.#runtime.asset(key);
    return typeof asset === "string" ? encoder.encode(asset) : asset;
  }

  async textAsset(key: string): Promise<string> {
    const asset = await this.#runtime.asset(key);
    return typeof asset === "string" ? asset : decoder.decode(asset);
  }

  get groups(): Readonly<Params> {
    return this.use($urlGroups) as Readonly<Params>;
  }

  get path(): readonly string[] {
    return this.use($path);
  }

  get currentPath(): readonly string[] {
    return this.use($currentPath);
  }
}

// class SortedValues<T> {
//   readonly #indices: number[] = [];
//   readonly #values: T[][] = [];

//   insert(index: number, value: T): void {
//     for (let i = 0; i < this.#indices.length; i++) {
//       if (this.#indices[i] === index) {
//         this.#values[i].push(value);
//         return;
//       } else if (index < this.#indices[i]) {
//         this.#indices.splice(i, 0, index);
//         this.#values.splice(i, 0, [value]);
//         return;
//       }
//     }
//     this.#indices.push(index);
//     this.#values.push([value]);
//   }

//   shift(): [number, T[]] | undefined {
//     const index = this.#indices.shift();
//     const values = this.#values.shift();
//     return values ? [index!, values] : undefined;
//   }
// }

export const chainMiddlewares = <Params>(
  ...middlewares: Middleware<Params>[]
): Middleware<Params> =>
  //@ts-ignore Goal is to provide type safety from the outside
  middlewares.reduceRight<Middleware<Params>>(
    (next, p) => (parent) =>
      p(new RequestContext(next, parent as RequestContext<unknown>)),
    noop,
  );
