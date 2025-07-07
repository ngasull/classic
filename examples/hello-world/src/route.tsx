import { declareLayout, declarePage } from "@classic/server";
import { Bundle } from "@classic/server/bundle";
import { styled } from "@classic/server/css";
import { dbContext } from "./db.ts";

export const styles = styled.css`
  body {
    background: #ddd;
    padding: 32px;
  }
`;

export const bundle = new Bundle("js");
const router = bundle.add<typeof import("@classic/router")>("@classic/router");

export const layout = declareLayout((children) => {
  return (
    <html>
      <head>
        <title>Hello world</title>
        <meta charset="utf-8" />
        <link rel="stylesheet" href={styles.path} />
      </head>
      <body ref={() => router.init()}>
        {children}
      </body>
    </html>
  );
});

export default declarePage(() => {
  const db = dbContext.use();
  return (
    <>
      <h1>Welcome</h1>
      <p>
        You should visit <a href="/world">the world</a>
      </p>
      <p>Its rank is #{db.multiverseNo} in the multiverse</p>
    </>
  );
});
