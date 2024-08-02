import { NULL } from "@classic/util";

export type PropType<T> = (attr: string | null) => T;

export const boolean: PropType<boolean> = (attr) => attr != NULL;
export const bigint: PropType<bigint | null> = (attr) =>
  attr ? BigInt(attr) : NULL;
export const number: PropType<number | null> = (attr) =>
  attr ? Number(attr) : NULL;
export const string: PropType<string | null> = (attr) => attr;
export const date: PropType<Date | null> = (attr) =>
  attr ? new Date(attr) : NULL;
