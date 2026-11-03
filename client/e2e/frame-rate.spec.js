// ---------------------------------------------------------------
// e2e/frame-rate.spec.js - the office should draw at a steady frame rate.
// Open the page with ?debug to see the FPS counter. The test expects at
// least 50 frames per second (the target is 60).
// ---------------------------------------------------------------
import { expect, test } from "@playwright/test";

test("the office draws at about 60 frames per second", async ({ page }) => {
  await page.goto("/?debug");
  await expect(page.getByText("Connected")).toBeVisible();
  await page.getByLabel("Your name").fill("Frames");
  await page.getByRole("button", { name: "Enter office" }).click();
  await expect(page.locator(".office-canvas")).toBeVisible();

  // Let the frame counter settle for a few seconds
  await page.waitForTimeout(3000);

  const text = await page.locator("text=/FPS:/").innerText();
  const fps = Number(text.replace(/\D+/g, ""));
  expect(fps).toBeGreaterThanOrEqual(50);
});
