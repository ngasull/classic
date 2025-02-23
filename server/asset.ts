import type { Stringifiable } from "../js/stringify.ts";
import type { Async } from "./mod.ts";

export enum AssetKind {
  JS = 0,
  BYTES = 1,
  STRING = 2,
}

export type AssetContents<
  T extends Stringifiable | Uint8Array = Stringifiable | Uint8Array,
> = () => Async<T>;

export const $asset = Symbol("asset");

export class Asset<
  T extends Stringifiable | Uint8Array = Stringifiable | Uint8Array,
> {
  readonly [$asset] = true;
  readonly #contents: AssetContents<T>;
  readonly hint?: string;

  constructor(contents: AssetContents<T>, opts?: { hint?: string }) {
    this.#contents = contents;
    Object.defineProperty(this, "hint", { value: opts?.hint, writable: false });
  }

  async contents(): Promise<T> {
    return this.#contents();
  }

  [Symbol.for("Deno.customInspect")](_opts: Deno.InspectOptions) {
    return `Asset(${this.hint || ""})`;
  }
}
