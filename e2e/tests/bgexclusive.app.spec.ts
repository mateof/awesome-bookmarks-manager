import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * A card has either a background colour or a background image, never both:
 * setting one clears the other, whichever path the change comes through.
 */
const user = {
  email: "bg.exclusive.e2e@example.com",
  nickname: "bgexclusive",
  password: "EitherOrNotBoth24",
};

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("fondo: color e imagen son excluyentes", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const f = await (await req.post("/api/folders", { data: { name: "Fondo" } })).json();

  // A colour first.
  await req.patch(`/api/folders/${f.id}`, { data: { bgColor: "#ff0000" } });
  let folders = await (await req.get("/api/folders")).json();
  let row = folders.find((x: { id: string }) => x.id === f.id);
  expect(row.bgColor).toBe("#ff0000");
  expect(row.imageBlobPath).toBeNull();

  // Uploading an image drops the colour.
  const up = await req.post(`/api/folders/${f.id}/bg-image`, {
    multipart: { file: { name: "bg.png", mimeType: "image/png", buffer: PNG } },
  });
  expect(up.ok(), await up.text()).toBeTruthy();
  folders = await (await req.get("/api/folders")).json();
  row = folders.find((x: { id: string }) => x.id === f.id);
  expect(row.imageBlobPath).not.toBeNull();
  expect(row.bgColor).toBeNull();

  // Setting a colour again drops the image.
  await req.patch(`/api/folders/${f.id}`, { data: { bgColor: "#00ff00" } });
  folders = await (await req.get("/api/folders")).json();
  row = folders.find((x: { id: string }) => x.id === f.id);
  expect(row.bgColor).toBe("#00ff00");
  expect(row.imageBlobPath).toBeNull();
});
