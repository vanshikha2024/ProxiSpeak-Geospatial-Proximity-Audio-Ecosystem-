// ---------------------------------------------------------------
// e2e/audio-check.spec.js - the Week 2 "audio check".
// Two browsers join the same office, stand close together, and
// establish a WebRTC voice connection through the signaling server.
// ---------------------------------------------------------------
import { expect, test } from "@playwright/test";

// Open the app, type a name, and enter the office.
async function joinOffice(page, name) {
  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible();
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Enter office" }).click();
  await expect(page.locator(".office-canvas")).toBeVisible();
}

test("two browsers establish a WebRTC audio connection", async ({ browser }) => {
  // Two separate browser sessions, like two people on two computers
  const personA = await browser.newContext();
  const personB = await browser.newContext();
  const a = await personA.newPage();
  const b = await personB.newPage();

  await joinOffice(a, "Asha");
  await joinOffice(b, "Ben");

  // Both turn on their microphones
  await a.getByRole("button", { name: /Join voice/ }).click();
  await b.getByRole("button", { name: /Join voice/ }).click();

  // Both sides see that the voice connection is up
  await expect(a.locator(".nearby-panel")).toContainText("voice connected", { timeout: 30_000 });
  await expect(b.locator(".nearby-panel")).toContainText("voice connected", { timeout: 30_000 });

  // Audio actually arrives: each side has a live remote audio track
  const hasLiveRemoteAudio = (page) =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll("audio")).some(
        (el) =>
          el.srcObject &&
          el.srcObject.getAudioTracks().some((track) => track.readyState === "live")
      )
    );
  await expect.poll(() => hasLiveRemoteAudio(a), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => hasLiveRemoteAudio(b), { timeout: 15_000 }).toBe(true);

  await personA.close();
  await personB.close();
});
