// ---------------------------------------------------------------
// e2e/sound-blocking.spec.js - a wall between two people makes their
// voices much quieter. The office layout is supplied by the test (a fake
// server reply), so this runs without a database.
//
// The test uses its own room, so nobody else in the office can change
// where the two people spawn. Asha starts at x=100 and Ben at x=160
// (60 px apart, so the volume without a wall would be 0.40). The wall
// sits between them, which lowers the volume to 0.40 x 0.35 = 0.14.
// ---------------------------------------------------------------
import { expect, test } from "@playwright/test";

const LAYOUT = {
  width: 720,
  height: 420,
  obstacles: [{ x: 130, y: 50, width: 10, height: 100, label: "Wall" }],
};

// A room name no one else uses, so the spawn positions are always the same
const ROOM = `wall-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function joinOffice(page, name) {
  await page.route("**/api/rooms/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ roomId: ROOM, ...LAYOUT }),
    })
  );
  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible();
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Room id").fill(ROOM);
  await page.getByRole("button", { name: "Enter office" }).click();
  await expect(page.locator(".office-canvas")).toBeVisible();
}

test("a wall between two people makes their voices much quieter", async ({ browser }) => {
  // Someone else already in the main office (this must not change the result)
  const bystander = await (await browser.newContext()).newPage();
  await bystander.goto("/");
  await expect(bystander.getByText("Connected")).toBeVisible();
  await bystander.getByLabel("Your name").fill("Bystander");
  await bystander.getByRole("button", { name: "Enter office" }).click();
  await expect(bystander.locator(".office-canvas")).toBeVisible();

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
