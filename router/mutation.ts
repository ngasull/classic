import type { Middleware } from "@classic/server";
import type { FileBuild } from "./serve.ts";

export const mutation: <Params>(
  r: FileBuild<Params>,
  handler: Middleware<Params>,
) => void = (r, handler): void => {
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
};
