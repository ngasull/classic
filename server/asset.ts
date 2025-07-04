import { Context } from "@classic/context";
import { js, JSable, type JSMeta, jsSymbol } from "@classic/js";
import type { Stringifiable } from "@classic/js/stringify";
import type { PrebuildContext, RuntimeServer } from "./runtime.ts";

type Async<T> = T | PromiseLike<T>;

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
  T extends Stringifiable | Uint8Array | JSable =
    | Stringifiable
    | Uint8Array
    | JSable,
> {
  /** @ignore */
  readonly [$asset] = true;
  readonly #contents: Async<T> | (() => Async<T>);
  readonly #hint?: string;
  #jsMeta?: JSMeta;

  /**
   * @param data to provide at runtime
   * @param options
   */
  constructor(contents: Async<T> | (() => Async<T>), options?: AssetOptions) {
    this.#contents = contents;
    this.#hint = options?.hint;
  }

  /** Helps identifying stored resource */
  get hint(): string | undefined {
    return this.#hint;
  }

  /** Data to retrieve */
  async contents(): Promise<T> {
    return typeof this.#contents === "function"
      ? this.#contents()
      : this.#contents;
  }

  /** @ignore */
  get [jsSymbol](): JSMeta {
    return this.#jsMeta ??= (() => {
      const assetIndices = $assetIndices.use();
      let assetIndex = assetIndices.get(this);
      if (assetIndex == null) {
        assetIndices.set(this, assetIndex = assetIndices.size);
      }
      return (this.hint == null
        ? contextJs.asset(assetIndex)
        : contextJs.asset(assetIndex, this.hint));
    })()[jsSymbol];
  }

  /** @ignore */
  [Symbol.for("Deno.customInspect")](_opts: Deno.InspectOptions): string {
    return `Asset(${this.hint || "..."})`;
  }
}

const contextJs = js<PrebuildContext>`c`;

export const $assetIndices = Context.for<Map<Asset, number>>(
  "classic.assetIndices",
);
