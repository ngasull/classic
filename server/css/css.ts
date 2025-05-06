import { ListOption } from "@classic/context/option";
import { type Async, useBuild } from "@classic/server/build";
import { serveAsset } from "@classic/server/plugin/asset-serve";
import { create as createHash } from "@jabr/xxhash64";
import { concat } from "@std/bytes";
import { encodeBase64 } from "@std/encoding";
import { transform as transformCss } from "lightningcss";

/**
 * API to build a style sheet
 *
 * @example Declare a style sheet that sets dark grey text color for every page of a layout
 * ```tsx
 * import { useBuild } from "@classic/server/build";
 * import { BuiltStyleSheet } from "@classic/server/css";
 *
 * const styles = new BuiltStyleSheet()
 *
 * const useStylesLink = () =>
 *   useBuild(async () => {
 *     styles.css`
 *       body {
 *         color: #666;
 *       }
 *     `;
 *
 *     return `<link rel="stylesheet" href="${JSON.stringify(styles.usePath())}" />`
 *   });
 * ```
 */
export class BuiltStyleSheet {
  #option = new ListOption<Uint8Array>();

  /** Template function to add css to built style sheet */
  css(
    tpl: TemplateStringsArray,
    ...values: Array<string | (() => Async<Uint8Array>)>
  ): void {
    useBuild(async () => {
      const interpolations = await Promise.all(
        values.map(async (v) =>
          typeof v === "string" ? encoder.encode(v) : await v()
        ),
      );
      const parts = interpolations.flatMap((v, i) => [
        typeof v === "string" ? encoder.encode(v) : v,
        encoder.encode(tpl[i + 1]),
      ]);
      parts.unshift(encoder.encode(tpl[0]));
      this.#option.add(...parts);
    });
  }

  useBytes(
    pathHint?: string,
  ): Promise<{ code: Uint8Array; map: Uint8Array; fileName: string }> {
    return useBuild(async () => {
      // @ts-ignore FIXME remove this line when https://github.com/denoland/std/pull/6639 is merged and available
      const input = concat(await this.#option.use());

      const hash = await encodeHash(input);
      const fileName = `/.css/${pathHint ? `${pathHint}.` : ""}${hash}.css`;

      const { code, map } = transformCss({
        filename: fileName,
        code: input,
        sourceMap: true,
      });

      return { code, map: map!, fileName };
    });
  }

  /** Retrieve generated stylesheet's public path */
  usePath(pathHint?: string): Promise<string> {
    return useBuild(async () => {
      const { code, map, fileName } = await this.useBytes(pathHint);

      const path = serveAsset({
        pathHint: fileName,
        contents: () => code,
      });

      if (map) {
        serveAsset({
          path: path + ".map",
          contents: () => map,
        });
      }

      return path;
    });
  }
}

const encoder = new TextEncoder();

const encodeHash = async (data: Uint8Array) => {
  const hasher = await createHash();
  hasher.update(data);
  return encodeBase64(hasher.digest() as Uint8Array);
};
