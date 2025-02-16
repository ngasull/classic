import { contentType } from "@std/media-types/content-type";
import type { Middleware } from "../mod.ts";

export default (
  asset: number,
  ext: string,
  headers: Record<string, string>,
): Middleware => {
  if (headers["Content-Type"] == null) {
    headers["Content-Type"] = contentType(ext) ?? "text/plain; charset=UTF-8";
  }
  return async (ctx) =>
    new Response(await ctx.runtime.asset(asset), {
      headers,
    });
};
