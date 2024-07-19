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

type FakePath<P> = P extends
  [infer H extends string, ...infer T extends string[]] ? `/:${H}${FakePath<T>}`
  : ``;

// https://www.hacklewayne.com/typescript-convert-union-to-tuple-array-yes-but-how
type Contra<T> = T extends any ? (arg: T) => void
  : never;

type InferContra<T> = [T] extends [(arg: infer I) => void] ? I
  : never;

type PickOne<T> = InferContra<InferContra<Contra<Contra<T>>>>;

type Union2Tuple<T> = PickOne<T> extends infer U
  ? Exclude<T, U> extends never ? [T]
  : [...Union2Tuple<Exclude<T, U>>, U]
  : never;
