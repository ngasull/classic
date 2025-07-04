import { create as createHash } from "@jabr/xxhash64";
import { concat } from "@std/bytes";
import { encodeBase64 } from "@std/encoding";
import { ServedAsset } from "../asset-serve/mod.ts";
import type { BuildableOptions } from "../mod.ts";

type Async<T> = T | PromiseLike<T>;

export type { ServedCss };

/** Buildable and served stylesheet */
class ServedCss {
  readonly #tpl: TemplateStringsArray;
  readonly #values: Array<string | (() => Async<Uint8Array>)>;
  #path?: string;

  /** @internal */
  constructor(
    tpl: TemplateStringsArray,
    values: Array<string | (() => Async<Uint8Array>)>,
  ) {
    this.#tpl = tpl;
    this.#values = values;
  }

  /** Public stylesheet path */
  get path(): string {
    return this.#path!;
  }

  [Symbol.for("classic.buildable")](): BuildableOptions {
    return {
      build: async (exported) => {
        const { transform } = await import("lightningcss");

        const interpolations = await Promise.all(
          this.#values.map(async (v) =>
            typeof v === "string" ? encoder.encode(v) : await v()
          ),
        );
        const bytes = interpolations.flatMap((v, i) => [
          typeof v === "string" ? encoder.encode(v) : v,
          encoder.encode(this.#tpl[i + 1]),
        ]);
        bytes.unshift(encoder.encode(this.#tpl[0]));
        const input = concat(bytes);
        const hash = await encodeHash(input);
        // const fileName = `/.css/${pathHint ? `${pathHint}.` : ""}${hash}.css`;
        const fileName = `/.css/${hash}.css`;

        const { code, map } = transform({
          filename: fileName,
          code: input,
          sourceMap: true,
        });

        const path = exported.build<string>(
          new ServedAsset({
            pathHint: fileName,
            contents: () => code,
          }),
        );
        if (map) {
          exported.build(
            new ServedAsset({
              path: path + ".map",
              contents: () => map,
            }),
          );
        }

        return path;
      },

      restore: (value) => {
        this.#path = value as string;
      },
    };
  }
}

/** @see {@linkcode styled.css} */
export const styled = {
  /** Generate a style sheet from a template literal */
  css: (
    tpl: TemplateStringsArray,
    ...values: Array<string | (() => Async<Uint8Array>)>
  ): ServedCss => new ServedCss(tpl, values),
};

const encoder = new TextEncoder();

const encodeHash = async (data: Uint8Array) => {
  const hasher = await createHash();
  hasher.update(data);
  return encodeBase64(hasher.digest() as Uint8Array);
};
