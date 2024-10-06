import type { AppBuild } from "@classic/build";
import type { Context } from "hono";
import type { Env, Input, MiddlewareHandler } from "hono/types";
import { fileRouter, scanRoutes } from "./file-router.ts";
import { $build, createContext } from "./render.ts";
import type { Router } from "./router.ts";
import type { JSX, JSXContextInit } from "./types.ts";

const honoContext = createContext<Context>("hono");

export const $hono = (use: JSX.Use): Context => use(honoContext);

export const classicRouter = <E extends Env, P extends string, I extends Input>(
  router: Router,
  { context = () => [], ...opts }: {
    build: AppBuild;
    context?: (c: Context<E, P, I>) => JSXContextInit<unknown>[];
  },
): MiddlewareHandler<E, P, I> =>
async (c, next) =>
  await router.fetch(c.req.raw, {
    context: [honoContext.init(c), ...context(c)],
    ...opts,
  }) ??
    next();

export const classicFileRouter = <
  E extends Env,
  P extends string,
  I extends Input,
>(
  base: string,
  { build, context }: {
    build: AppBuild;
    context?: (c: Context<E, P, I>) => JSXContextInit<unknown>[];
  },
): MiddlewareHandler<E, P, I> => {
  const routerQ = scanRoutes(base).then(fileRouter);
  return async (c, next) =>
    build.fetch(c.req.raw) ??
      await (await routerQ)(c.req.raw, [
        honoContext.init(c),
        $build.init(build),
        ...context?.(c) ?? [],
      ]) ??
      next();
};

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
