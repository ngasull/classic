import { Context } from "@classic/context";
import { type Stringifiable, stringify } from "@classic/js/stringify";
import { join } from "@std/path/join";
import type { Async } from "./mod.ts";

export enum AssetKind {
  JS = 0,
  BYTES = 1,
  STRING = 2,
}

export const $asset = Symbol("asset");

/** Options for {@linkcode Asset}'s constructor */
export interface AssetOptions {
  /** Helps identifying stored resource */
  readonly hint?: string;
}

/**
 * Data that can be stored and retrieved on-demand
 *
 * Its data should ne produced at build time and
 * can be retrieved lated in this same data structure.
 */
export class Asset<
  T extends Stringifiable | Uint8Array = Stringifiable | Uint8Array,
> {
  /** @ignore */
  readonly [$asset] = true;
  readonly #contents: () => Async<T>;
  readonly #hint?: string;

  /**
   * @param data to provide at runtime
   * @param options
   */
  constructor(contents: Async<T> | (() => Async<T>), options?: AssetOptions) {
    this.#contents = typeof contents === "function" ? contents : () => contents;
    this.#hint = options?.hint;
  }

  /** Helps identifying stored resource */
  get hint(): string | undefined {
    return this.#hint;
  }

  /** Data to retrieve */
  async contents(): Promise<T> {
    return this.#contents();
  }

  /** @ignore */
  stringify(): string {
    const assetIndices = $assetIndices.use();
    let assetIndex = assetIndices.get(this);
    if (assetIndex == null) {
      assetIndices.set(this, assetIndex = assetIndices.size);
    }
    return this.hint == null
      ? `c.asset(${assetIndex})`
      : `c.asset(${assetIndex},${JSON.stringify(this.hint)})`;
  }

  /** @ignore */
  [Symbol.for("Deno.customInspect")](_opts: Deno.InspectOptions): string {
    return `Asset(${this.hint || "..."})`;
  }
}

const $assetIndices = Context.for<Map<Asset, number>>(
  "classic.assetIndices",
);

export const writeAssets = async (
  value: Stringifiable,
  assetsDir: string,
): Promise<[string, Array<readonly [AssetKind, string]>]> => {
  const assetIndices = new Map<Asset, number>();
  const meta = $assetIndices.provide(assetIndices, stringify, value);

  const assetKeys = new Set<string>();
  const assetsMeta: Array<readonly [AssetKind, string]> = [];
  let writtenSize = 0;
  while (assetIndices.size > writtenSize) {
    assetsMeta.push(
      ...await Promise.all(
        [...assetIndices.keys()].slice(writtenSize).map(
          async (asset, i) => {
            const contents = await asset.contents();

            const makeKey = (suffix?: string) => {
              const index = assetsMeta.length + i;
              const hint = asset.hint?.replaceAll("/", "__") ??
                index.toString();

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
                  $assetIndices.provide(assetIndices, stringify, value)
                });`,
              );
              return [AssetKind.JS, key] as const;
            }
          },
        ),
      ),
    );
    writtenSize = assetIndices.size;
  }

  return [meta, assetsMeta];
};
