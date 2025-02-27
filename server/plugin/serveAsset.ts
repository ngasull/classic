import { Key } from "@classic/context";
import { contentType } from "@std/media-types/content-type";
import { extension } from "@std/media-types/extension";
import { basename } from "@std/path/basename";
import { extname } from "@std/path/extname";
import type { Build } from "../build.ts";

const $preferredStaticRoot = new Key<string>("preferredStaticRoot");

/** Options for {@linkcode serveAsset} */
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
 * Declares a static asset to serve and returns its public pathname
 *
 * Response's Content-Type is guessed from original path extension if not specified explicitly.
 *
 * @param {ServeAssetOptions} options Options for serving
 *
 * @returns The public pathname where the asset is served
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
export const serveAsset = (
  route: Build,
  options: ServeAssetOptions,
): string => {
  let { path, pathHint, contents, contentType: ct, headers = {} } = options;
  path ??= (route.get($preferredStaticRoot) ?? "/static/") +
    (pathHint ?? "asset");
  pathHint ??= basename(path);

  let ext: string | undefined = extname(path);
  if (ext) {
    ct ??= contentType(ext);
  } else if (ct) {
    ext = extension(ct);
    if (!ext) headers = { "Content-Type": ct, ...headers };
  }

  route.root(path).method(
    "GET",
    import.meta.resolve("./serveAsset-runtime.ts"),
    route.asset(contents, { hint: pathHint }),
    ext,
    headers,
  );

  return path;
};
