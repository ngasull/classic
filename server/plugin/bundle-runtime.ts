import type { Resolver } from "@classic/js";
import { RequestContext } from "../request.ts";

const $moduleMap = new RequestContext<Record<string, string>>();

export const useResolver: () => Resolver | undefined = () => {
  const moduleMap = $moduleMap.get();
  return moduleMap ? (spec) => moduleMap[spec] : undefined;
};

export const resolveModule: Resolver = (spec) => $moduleMap.get()![spec];

export default (moduleMap: Record<string, string>): void => {
  $moduleMap.set(moduleMap);
};
