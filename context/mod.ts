/**
 * # Classic context
 *
 * Type-safe dynamic runtime state API.
 *
 * 1. Declare a key for a specific runtime type
 * 2. Create a runtime context _(example: a context attached to a sever request's life cycle)
 * 3. Provide the typed data in the context
 * 4. Retrieve data in user modules
 *
 * ### Deriving contexts
 *
 * Sub-contexts can be created: they derive from their ancestors but won't modify them.
 * See related example.
 *
 * @example End-to-end declare, provide & use summary
 * ```ts
 * import { Key } from "@classic/context";
 * import { assert } from "@std/assert";
 *
 * type User = {
 *   id: bigint;
 *   name: string;
 * };
 *
 * // Shared code - export this key to provider and consumers
 * export const $user = new Key<User>("user");
 *
 * // Provider code
 * import { createContext } from "@classic/context/create";
 *
 * const john = {
 *   id: 42n,
 *   name: "John",
 * };
 * const context = createContext();
 * context.provide($user, john);
 *
 * // Consumer code - `user` is correctly typed as `User`
 * const user = context.use($user);
 * assert(user === john);
 * ```
 *
 * @example Use functions: same consumer API, custom provider logic
 * ```ts
 * import { type Context, Key } from "@classic/context";
 * import { createContext } from "@classic/context/create";
 * import { assert } from "@std/assert";
 *
 * type User = {
 *   id: bigint;
 *   name: string;
 * };
 *
 * export const $user = new Key<User>("user");
 * export const $userId = (ctx: Context) => ctx.use($user).id;
 *
 * const context = createContext();
 * context.provide($user, {
 *   id: 42n,
 *   name: "John"
 * });
 *
 * // Looks the same, but abstracts logic over the context
 * const userId = context.use($userId);
 * assert(userId === 42n);
 * ```
 *
 * @example Safe or optional context access
 * ```ts
 * import { Key } from "@classic/context";
 * import { createContext } from "@classic/context/create";
 * import { assert, assertThrows } from "@std/assert";
 *
 * export const $sessionId = new Key<string>("sessionId");
 * const context = createContext();
 *
 * assertThrows(() => context.use($sessionId));
 * assert(context.get($sessionId) === undefined);
 * ```
 *
 * @example Derive a context
 * ```ts
 * import { Key } from "@classic/context";
 * import { createContext } from "@classic/context/create";
 * import { assert, assertThrows } from "@std/assert";
 *
 * const context = createContext();
 *
 * export const $sessionId = new Key<string>("sessionId");
 * const session = createContext(context);
 * session.provide($sessionId, "secret")
 *
 * assert(context.get($sessionId) === undefined);
 * assert(session.get($sessionId) === "secret");
 * ```
 *
 * @module
 */

export type { Context, UseArgs } from "./context.ts";
export { Key } from "./key.ts";
