import { NULL } from "@classic/util";

/** Represents a property type */
export type PropType<T> = (attr: string | null) => T;

/** The boolean `PropType` */
export const boolean: PropType<boolean> = (attr) => attr != NULL;

/** The bigint `PropType` */
export const bigint: PropType<bigint | null> = (attr) =>
  attr ? BigInt(attr) : NULL;

/** The number `PropType` */
export const number: PropType<number | null> = (attr) =>
  attr ? Number(attr) : NULL;

/** The string `PropType` */
export const string: PropType<string | null> = (attr) => attr;

/** The {@linkcode Date} `PropType` */
export const date: PropType<Date | null> = (attr) =>
  attr ? new Date(attr) : NULL;
