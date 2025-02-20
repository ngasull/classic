import { contentType } from "@std/media-types/content-type";
import type { Middleware } from "../mod.ts";
import type { Asset } from "../build.ts";

export default (
  asset: Asset<Uint8Array>,
  ext: string,
  headers: Record<string, string>,
): Middleware => {
  if (headers["Content-Type"] == null) {
    headers["Content-Type"] = contentType(ext) ?? "text/plain; charset=UTF-8";
  }
  return async () => new Response(await asset.contents(), { headers });
};
