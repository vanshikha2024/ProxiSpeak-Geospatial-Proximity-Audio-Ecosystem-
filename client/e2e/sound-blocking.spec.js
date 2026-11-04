// ---------------------------------------------------------------
// e2e/sound-blocking.spec.js - a wall between two people makes their
// voices much quieter. The office layout is supplied by the test (a fake
// server reply), so this runs without a database.
//
// Asha stands at x=100 and Ben at x=160 (60 px apart, so the volume
// without a wall would be 0.40). A wall between them lowers it to
// 0.40 x 0.35 = 0.14.
// ---------------------------------------------------------------
import { expect, test } from "@playwright/test";

const LAYOUT = {
  roomId: "main-office",
  width: 720,
  height: 420,
  obstacles: [{ x: 130, y: 50, width: 10, height: 100, label: "Wall" }],
};

async function joinOffice(page, name) {
  await page.route("**/api/rooms/main-office", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(LAYOUT) })
  );
  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible();
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Enter office" }).click();
  await expect(page.locator(".office-canvas")).toBeVisible();
}

test("a wall between two people makes their voices much quieter", async ({ browser }) => {
  const personA = await browser.newContext();
  const personB = await browser.newContext();
  const a = await personA.newPage();
  const b = await personB.newPage();

  await joinOffice(a, "Asha");
  await joinOffice(b, "Ben");

  await a.getByRole("button", { name: /Join voice/ }).click();
  await b.getByRole("button", { name: /Join voice/ }).click();
  await expect(a.locator(".nearby-panel")).toContainText("voice connected", { timeout: 30_000 });

  await expect(a.locator("[data-volume]")).toHaveAttribute("data-volume", "0.14", { timeout: 10_000 });
  await expect(b.locator("[data-volume]")).toHaveAttribute("data-volume", "0.14", { timeout: 10_000 });

  await personA.close();
  await personB.close();
});
