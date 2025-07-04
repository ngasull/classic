import { contentType } from "@std/media-types/content-type";
import type { Asset } from "../mod.ts";

export default async (
  asset: Asset<Uint8Array | string>,
  ext: string | undefined,
  headers: Record<string, string>,
): Promise<Response> => {
  if (headers["Content-Type"] == null) {
    headers["Content-Type"] = (ext ? contentType(ext) : null) ??
      "text/plain; charset=UTF-8";
  }
  return new Response(await asset.contents(), { headers });
};
