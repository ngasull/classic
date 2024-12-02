import type { BuildRoute } from "../build.ts";
import { $rootBuild } from "../file-router.ts";
import type { RequestContextAPI } from "../middleware.ts";
import { createUseKey } from "../use.ts";

const $preferredStaticRoot = createUseKey<string>("preferredStaticRoot");

let staticExtRegExp: RegExp | undefined;

export const staticContents = (
  build: BuildRoute,
  { path, pathHint, contents, headers }: {
    contents: () => string | Uint8Array | PromiseLike<string | Uint8Array>;
    headers?: Record<string, string | undefined>;
  } & ({ pathHint: string; path?: never } | { pathHint?: never; path: string }),
): string => {
  const rootBuild = build.use($rootBuild);

  staticExtRegExp ??= new RegExp(`\.(${
    Object.keys(responseHeaders)
      .map((ext) => ext.replaceAll(".", "\\."))
      .join("|")
  })$`);
  path ??= (rootBuild.use.get($preferredStaticRoot) ?? "/static/") + pathHint;
  const extension = path.match(staticExtRegExp)?.[1] ??
    "";
  const asset = build.asset(contents);
  const staticHeaders = {
    ...responseHeaders[extension as keyof typeof responseHeaders] ??
      defaultHeaders,
    ...headers,
  };

  rootBuild.get(path, import.meta.url, asset, staticHeaders);
  return path;
};

export default (asset: string, headers: Record<string, string>) =>
async (ctx: RequestContextAPI) =>
  new Response(await ctx.asset(asset), { headers });

const responseHeaders = {
  "html": {
    "Content-Type": "text/html; charset=UTF-8",
  },
  "css": {
    "Content-Type": "text/css; charset=UTF-8",
  },
  "css.map": {
    "Content-Type": "application/json; charset=UTF-8",
  },
};

const defaultHeaders = {
  "Content-Type": "text/plain; charset=UTF-8",
};
