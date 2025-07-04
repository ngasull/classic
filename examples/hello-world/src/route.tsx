import { declareLayout, declarePage } from "@classic/server";
import { styled } from "@classic/server/css";
import { dbContext } from "./db.ts";

// deno-fmt-ignore
export const styles = styled.css`
  body {
    background: #ddd;
    padding: 32px;
  }
`;

export const layout = declareLayout((children) => {
  return (
    <html>
      <head>
        <title>Hello world</title>
        <meta charset="utf-8" />
        <link rel="stylesheet" href={styles.path} />
      </head>
      <body>
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
