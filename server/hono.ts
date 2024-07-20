import type { ServedJSContext } from "@classic/js";
import type { Context } from "hono";
import type { Env, Input, MiddlewareHandler } from "hono/types";
import { createContext } from "./render.ts";
import type { Segment } from "./router.ts";
import type { JSXContextAPI, JSXContextInit } from "./types.ts";

const honoContext = createContext<Context>("hono");

export const $hono = (use: JSXContextAPI): Context => use(honoContext);

export const classicRouter = <E extends Env, P extends string, I extends Input>(
  router: Segment<never, never, undefined>,
  { context = () => [], ...opts }: {
    context?: (c: Context<E, P, I>) => JSXContextInit<unknown>[];
    js?: ServedJSContext;
  } = {},
): MiddlewareHandler<E, P, I> =>
async (c, next) =>
  await router.fetch(c.req.raw, {
    context: [honoContext.init(c), ...context(c)],
    ...opts,
  }) ??
    next();
