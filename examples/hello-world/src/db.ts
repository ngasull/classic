import { createContext } from "classic-web/jsx/render.ts";

type DB = {
  hello: string;
  multiverseNo: number;
};

export const dbContext = createContext<DB>("db");
