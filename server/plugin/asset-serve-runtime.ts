import type { Asset } from "@classic/server";
import { contentType } from "@std/media-types/content-type";

export default async (
  asset: Asset<Uint8Array>,
  ext: string,
  headers: Record<string, string>,
): Promise<Response> => {
  if (headers["Content-Type"] == null) {
    headers["Content-Type"] = contentType(ext) ?? "text/plain; charset=UTF-8";
  }
  return new Response(await asset.contents(), { headers });
};
