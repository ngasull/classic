import { Buildable } from "@classic/server";
import { create as createHash } from "@jabr/xxhash64";
import { concat } from "@std/bytes";
import { encodeBase64 } from "@std/encoding";
import { transform } from "lightningcss";
import { ServedAsset } from "../plugin/asset-serve-build.ts";

type Async<T> = T | PromiseLike<T>;

export type { ServedCss };

/** Buildable and served stylesheet */
class ServedCss extends Buildable<Promise<string>> {
  #path?: string;

  /** @internal */
  constructor(
    tpl: TemplateStringsArray,
    values: Array<string | (() => Async<Uint8Array>)>,
  ) {
    super(async (exported) => {
      const interpolations = await Promise.all(
        values.map(async (v) =>
          typeof v === "string" ? encoder.encode(v) : await v()
        ),
      );
      const bytes = interpolations.flatMap((v, i) => [
        typeof v === "string" ? encoder.encode(v) : v,
        encoder.encode(tpl[i + 1]),
      ]);
      bytes.unshift(encoder.encode(tpl[0]));
      const input = concat(bytes);
      const hash = await encodeHash(input);
      // const fileName = `/.css/${pathHint ? `${pathHint}.` : ""}${hash}.css`;
      const fileName = `/.css/${hash}.css`;

      const { code, map } = transform({
        filename: fileName,
        code: input,
        sourceMap: true,
      });

      const path = exported.build(
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
    });
  }

  /** @internal */
  override restore(value: string): void {
    this.#path = value;
  }

  /** Public stylesheet path */
  get path(): string {
    return this.#path!;
  }
}

/** @see {@linkcode styled.css} */
export const styled = {
  /**
   * Compile and serve style sheets on the fly
   *
   * @example Declare a style sheet that sets dark grey text color for every page of a layout
   * ```tsx
   * import { declareLayout } from "@classic/server";
   * import { styled } from "@classic/server/css";
   *
   * export const styles = styled.css`
   *   body {
   *     color: #666;
   *   }
   * `;
   *
   * export const layout = declareLayout((children) => (
   *    <html>
   *      <head>
   *        <title>Hello world</title>
   *        <meta charset="utf-8" />
   *        <link rel="stylesheet" href={styles.path} />
   *      </head>
   *      <body>
   *        {children}
   *      </body>
   *    </html>
   * ));
   * ```
   */
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
