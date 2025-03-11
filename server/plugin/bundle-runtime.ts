import { type Context, Key } from "@classic/context";
import type { Resolver } from "@classic/js";
import type { ClassicRequest } from "@classic/server";

const $moduleMap = new Key<Record<string, string>>(
  "module map",
);

export const resolveModule = (context: Context): Resolver => (spec) =>
  context.use($moduleMap)[spec];

export default (moduleMap: Record<string, string>) =>
(ctx: ClassicRequest<Record<never, string>>) => {
  ctx.provide($moduleMap, moduleMap);
  return ctx.next();
};
