import { createContext } from "jsx-machine/jsx/render.ts";

type DB = {
  hello: string;
  multiverseNo: number;
};

export const dbContext = createContext<DB>("db");
