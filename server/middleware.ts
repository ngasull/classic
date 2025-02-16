import { RegExpRouter } from "@hono/hono/router/reg-exp-router";
import { join } from "@std/path";
import type { BuildMeta, HandlerParam, RequestMapping } from "./build.ts";
import { BaseContext } from "./context.ts";
import { Key } from "./key.ts";
import type { Async } from "./mod.ts";

const noop = () => {};
const asyncNoop = async () => {};

export type Middleware<Params = Record<never, string>> = (
  ctx: MiddlewareContext<Params>,
) => Async<Response | void>;

export class ClassicRuntime {
  constructor(
    mappings: RequestMapping[],
    assets: ReadonlyArray<[string, () => Async<string | Uint8Array>]>,
  ) {
    this.#mappings = mappings;
    this.#assets = assets;

    this.#router = new RegExpRouter();
    for (const [method, ...target] of mappings) {
      const pattern = target[0];
      console.debug("Add", method, ...target);
      this.#router.add(method, pattern, target);
    }
  }

  readonly #mappings: RequestMapping[];
  readonly #assets: ReadonlyArray<[string, () => Async<string | Uint8Array>]>;
  readonly #router: RegExpRouter<[string, string, ...Readonly<HandlerParam>[]]>;

  readonly handle = async (req: Request): Promise<Response> => {
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

  async #asset(key: number): Promise<string | Uint8Array> {
    const asset = this.#assets[key];
    if (!asset) throw Error(`No built asset with id ${key}`);
    return asset[1]();
  }

  async asset(key: number): Promise<Uint8Array> {
    const asset = await this.#asset(key);
    return typeof asset === "string" ? encoder.encode(asset) : asset;
  }

  async textAsset(key: number): Promise<string> {
    const asset = await this.#asset(key);
    return typeof asset === "string" ? asset : decoder.decode(asset);
  }

  async write(
    buildDirectory: string = join(Deno.cwd(), ".build"),
  ): Promise<void> {
    const assetsDirectory = join(buildDirectory, "asset");
    const meta: BuildMeta = {
      mappings: this.#mappings,
      assets: this.#assets.map(([key]) => key),
    };

    await Promise.all([
      Deno.writeTextFile(
        join(buildDirectory, "meta.json"),
        JSON.stringify(meta),
      ),
      ...this.#assets.map(async ([key, getContents]) => {
        const contents = await getContents();
        return typeof contents === "string"
          ? Deno.writeTextFile(join(assetsDirectory, key), contents)
          : Deno.writeFile(join(assetsDirectory, key), contents);
      }),
    ]);
  }

  static async read(
    buildDirectory: string = join(Deno.cwd(), ".build"),
  ): Promise<ClassicRuntime> {
    const meta: BuildMeta = await import(join(buildDirectory, "meta.json"), {
      with: { type: "json" },
    });
    return new ClassicRuntime(
      meta.mappings,
      new Proxy([] as Array<[string, () => Async<string | Uint8Array>]>, {
        get: (assets, k: string) => {
          const key = parseInt(k);
          const hint = meta.assets[key];
          return assets[key] ??= [
            hint,
            () => Deno.readFile(join(buildDirectory, "asset", hint)),
          ];
        },
      }),
    );
  }
}

export const load = (buildDirectory?: string): Promise<ClassicRuntime> =>
  ClassicRuntime.read(buildDirectory);

export const $runtime = new Key<ClassicRuntime>("runtime");
const $urlGroups = new Key<Record<string, string>>("urlGroups");
const $matchedPattern = new Key<string>("matchedPattern");

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
      p(new MiddlewareContext(next, parent as MiddlewareContext<unknown>)),
    noop,
  );
