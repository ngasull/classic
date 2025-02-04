import type { FileBuildContext } from "../file-router.ts";
import { $runtime, type Middleware } from "../middleware.ts";

export const mutation = <Params>(
  r: FileBuildContext<Params>,
  handler: Middleware<Params>,
): void => {
  r.method("POST", async (ctx) => {
    let res = await handler(ctx);
    if (!res) {
      const contentLocation = new URL(".", ctx.request.url)
        .pathname.slice(0, -1);
      res = await ctx.use($runtime).handle(
        new Request(new URL(contentLocation, ctx.request.url)),
      );
      if (res) {
        res.headers.set("Content-Location", contentLocation);
      }
    }

    return res;
  });
};
