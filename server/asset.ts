import type { Stringifiable } from "@classic/js/stringify";
import type { Async } from "./mod.ts";

export enum AssetKind {
  JS = 0,
  BYTES = 1,
  STRING = 2,
}

export const $asset = Symbol("asset");

/** Options for {@linkcode Asset}'s constructor */
export interface NewAssetOptions {
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
  constructor(contents: () => Async<T>, options?: NewAssetOptions) {
    this.#contents = contents;
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
  [Symbol.for("Deno.customInspect")](_opts: Deno.InspectOptions) {
    return `Asset(${this.hint || ""})`;
  }
}
