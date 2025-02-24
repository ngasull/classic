import { RegExpRouter } from "@hono/hono/router/reg-exp-router";
import { exists } from "@std/fs/exists";
import { join } from "@std/path/join";
import {
  type Stringifiable,
  type StringifiableExt,
  stringify,
  type StringifyOpts,
} from "../js/stringify.ts";
import { $asset, type Asset, AssetKind } from "./asset.ts";
import { createContext } from "./context.ts";
import type { Async } from "./mod.ts";
import {
  $matchedPattern,
  $runtime,
  $urlGroups,
  type Middleware,
  notFound,
  runMiddlewares,
} from "./request.ts";

export type Method = "GET" | "POST" | "DELETE" | "PATCH" | "PUT";

export type HandlerParam = StringifiableExt<Asset> | undefined;

export type RequestMapping = [
  Method,
  string,
  string,
  ...Readonly<HandlerParam>[],
];

export class ClassicServer {
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
    const [matches, stash] = this.#router.match(
      req.method,
      new URL(req.url).pathname,
    );

    const context = createContext();
    context.provide($runtime, this);

    const [first, ...next] = matches.map(
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

    return await runMiddlewares(first, next, context, this, req) ??
      notFound;
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
      `import { ClassicServer, PrebuildContext } from ${
        JSON.stringify(import.meta.resolve("./prebuilt.ts"))
      };
const c = new PrebuildContext(import.meta.dirname, ${stringify(assetsMeta)});
export default new ClassicServer(${meta});
`,
    );
  }
}
