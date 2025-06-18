import { Asset, Buildable } from "@classic/server";
import { contentType } from "@std/media-types/content-type";
import { extension } from "@std/media-types/extension";
import { basename } from "@std/path/basename";
import { extname } from "@std/path/extname";

/** New {@linkcode ServedAsset} options */
export interface ServeAssetOptions {
  /** Exact path where the server send the asset */
  path?: string;
  /** Base name for the asset. Ignored if no `path` is given */
  pathHint?: string;
  /** Asset contents providing function */
  contents: () => string | Uint8Array | PromiseLike<string | Uint8Array>;
  /** Explictly specify a Content-Type. If not specified, `path` or `pathHint` extension is checked to determine Content-Type */
  contentType?: string;
  /** User-provided headers  */
  headers?: Record<string, string | undefined>;
}

/**
 * Static asset to serve
 *
 * Manages access to its public pathname at run time.
 * Response's Content-Type is guessed from original path extension if not specified explicitly.
 *
 * @example Serve a dark mode stylesheet and link to it
 * ```ts ignore
 * const darkModePathname = route.use(serveAsset, {
 *   pathHint: "dark-mode.css",
 *   contents: () => `html { background: black; color: white; }`,
 * });
 * const htmlLink =
 *   `<link rel="stylesheet" href="${darkModePathname}" />`;
 * ```
 */
export class ServedAsset extends Buildable<string> {
  #path?: string;

  /**
   * @constructor
   * @param options Options for serving
   */
  constructor(options: ServeAssetOptions) {
    super((exported) => {
      let { path, pathHint, contents, contentType: ct, headers = {} } = options;
      path ??= pathHint ?? "asset";
      pathHint ??= basename(path);

      let ext: string | undefined = extname(path);
      if (ext) {
        ct ??= contentType(ext);
      } else if (ct) {
        ext = extension(ct);
        if (!ext) headers = { "Content-Type": ct, ...headers };
      }

      exported.route({
        pattern: path,
        moduleUrl: new URL(import.meta.resolve("./asset-serve-runtime.ts")),
        params: [
          new Asset(contents, { hint: pathHint }),
          ext,
          headers,
        ],
      });

      return path;
    });
  }

  /** @internal */
  override restore(value: string): void {
    this.#path = value;
  }

  /** The public pathname where the asset is served */
  get path(): string {
    return this.#path!;
  }
}
