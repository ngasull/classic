import {
  defineFileBuilder,
  type FileBuild,
  type FileBuilder,
} from "../file-router.ts";
import type { Middleware } from "../middleware.ts";

export const mutation: FileBuilder<
  <Params>(r: FileBuild<Params>, handler: Middleware<Params>) => void
> = defineFileBuilder((r, handler): void => {
  r.method("POST", async (ctx) => {
    let res = await handler(ctx);
    if (!res) {
      const requestedLocation = ctx.url.searchParams.get("location");
      const contentLocation = requestedLocation
        ? requestedLocation
        : new URL(".", ctx.request.url).pathname.slice(0, -1);
      res = await ctx.runtime.fetch(
        new Request(new URL(contentLocation, ctx.request.url)),
      );
      if (res) {
        res.headers.set("Content-Location", contentLocation);
      }
    }

    return res;
  });
});
