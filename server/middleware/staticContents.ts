import type { BuildRoute } from "../build.ts";
import { $rootBuild } from "../file-router.ts";
import type { MiddlewareContext } from "../middleware.ts";
import { Key } from "../key.ts";

const $preferredStaticRoot = new Key<string>("preferredStaticRoot");

let staticExtRegExp: RegExp | undefined;

export const staticContents = (
  route: BuildRoute,
  { path, pathHint, contents, headers }: {
    contents: () => string | Uint8Array | PromiseLike<string | Uint8Array>;
    headers?: Record<string, string | undefined>;
  } & ({ pathHint: string; path?: never } | { pathHint?: never; path: string }),
): string => {
  const root = route.use($rootBuild);

  staticExtRegExp ??= new RegExp(`\.(${
    Object.keys(responseHeaders)
      .map((ext) => ext.replaceAll(".", "\\."))
      .join("|")
  })$`);
  path ??= (root.get($preferredStaticRoot) ?? "/static/") + pathHint;
  const extension = path.match(staticExtRegExp)?.[1] ??
    "";
  const asset = route.build.asset(contents);
  const staticHeaders = {
    ...responseHeaders[extension as keyof typeof responseHeaders] ??
      defaultHeaders,
    ...headers,
  };

  root.segment(path).method("GET", import.meta.url, asset, staticHeaders);
  return path;
};

export default (asset: string, headers: Record<string, string>) =>
async (ctx: MiddlewareContext<Record<never, string>>) =>
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
