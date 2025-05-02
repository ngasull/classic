import type { Resolver } from "@classic/js";
import { type Middleware, RequestContext } from "../runtime/mod.ts";

const $moduleMap = new RequestContext<Record<string, string>>();

export const resolveModule: Resolver = (spec) => $moduleMap.get()![spec];

export default (moduleMap: Record<string, string>): Middleware => () => {
  $moduleMap.set(moduleMap);
};
