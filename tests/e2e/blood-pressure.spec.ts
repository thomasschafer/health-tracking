import { expect, test, type Page } from "@playwright/test";

async function enterReadings(page: Page, readings: [number, number, number | null][]) {
  for (const [i, [systolic, diastolic, pulse]] of readings.entries()) {
    await page.getByLabel(`Systolic for reading ${String(i + 1)}`).fill(String(systolic));
    await page.getByLabel(`Diastolic for reading ${String(i + 1)}`).fill(String(diastolic));
    if (pulse !== null) {
      await page.getByLabel(`Pulse (optional) for reading ${String(i + 1)}`).fill(String(pulse));
    }
  }
}

const uniqueNote = (label: string) => `${label} ${crypto.randomUUID().slice(0, 8)}`;

test("records a session of three readings", async ({ page }) => {
  const note = uniqueNote("three readings");
  await page.goto("/");
  await page.getByRole("link", { name: "New blood pressure reading" }).click();
  await enterReadings(page, [
    [131, 81, 61],
    [128, 79, null],
    [125, 77, 63],
  ]);
  await page.getByLabel("Note (optional)").fill(note);
  await expect(page.getByText("Average of 3 readings: 128/79 · pulse 62")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText("Reading saved")).toBeVisible();
  await expect(page).toHaveURL("/");
  await page.getByRole("link", { name: "History" }).click();
  await expect(page.getByRole("link", { name: new RegExp(`128/79.*${note}`) })).toBeVisible();
});

test("moves to the next field once a value is complete", async ({ page }) => {
  await page.goto("/bp/new");
  await page.getByLabel("Systolic for reading 1").pressSequentially("128");
  await expect(page.getByLabel("Diastolic for reading 1")).toBeFocused();
  await page.keyboard.type("79");
  await expect(page.getByLabel("Pulse (optional) for reading 1")).toBeFocused();
  await page.keyboard.type("62");
  await expect(page.getByLabel("Systolic for reading 2")).toBeFocused();
});

test("blocks invalid readings and warns about unusual ones", async ({ page }) => {
  await page.goto("/bp/new");
  await page.getByRole("button", { name: "Remove last" }).click();
  await page.getByRole("button", { name: "Remove last" }).click();
  await enterReadings(page, [[70, 90, null]]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Reading 1: Systolic must be higher than diastolic")).toBeVisible();
  await expect(page).toHaveURL("/bp/new");

  await enterReadings(page, [[190, 100, null]]);
  await expect(page.getByText("Reading 1: This reading is very high.")).toBeVisible();
});

test("edits, deletes and restores a session", async ({ page }) => {
  const note = uniqueNote("to edit");
  await page.goto("/bp/new");
  await enterReadings(page, [
    [120, 80, null],
    [120, 80, null],
    [120, 80, null],
  ]);
  await page.getByLabel("Note (optional)").fill(note);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Reading saved")).toBeVisible();

  await page.goto("/bp/history");
  await page.getByRole("link", { name: new RegExp(note) }).click();
  await page.getByLabel("Systolic for reading 1").fill("150");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
  const row = page.getByRole("link", { name: new RegExp(`130/80.*${note}`) });
  await expect(row).toBeVisible();

  await row.click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete reading" }).click();
  await expect(page.getByText("Reading deleted")).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(note) })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("link", { name: new RegExp(note) })).toBeVisible();
});

test.describe("offline", () => {
  // Requests made by a service worker bypass page.route in some browsers.
  test.use({ serviceWorkers: "block" });

  test("keeps readings on the device while the laptop is unreachable", async ({ page }) => {
    const note = uniqueNote("offline");
    await page.goto("/");
    await expect(page.getByRole("link", { name: "New blood pressure reading" })).toBeVisible();
    await page.route("**/api/**", (route) => route.abort("connectionrefused"));

    await page.getByRole("link", { name: "New blood pressure reading" }).click();
    await enterReadings(page, [
      [122, 82, null],
      [122, 82, null],
      [122, 82, null],
    ]);
    await page.getByLabel("Note (optional)").fill(note);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved on this device. It will sync later.")).toBeVisible();
    await expect(page.getByText("1 reading hasn't synced yet")).toBeVisible();
    await expect(page.getByText("Can't reach the laptop.")).toBeVisible();

    // The queue must survive the app being closed and reopened.
    await page.reload();
    await expect(page.getByText("1 reading hasn't synced yet")).toBeVisible();
    await page.goto("/bp/history");
    await expect(
      page.getByRole("link", { name: new RegExp(`Not synced.*`) }).filter({ hasText: note }),
    ).toBeVisible();

    await page.unroute("**/api/**");
    await page.reload();
    await expect(page.getByText("hasn't synced yet")).toHaveCount(0);
    await expect(page.getByRole("link", { name: new RegExp(note) })).toBeVisible();
    await expect(page.getByText("Not synced")).toHaveCount(0);
  });
});

test("uses the readings-per-session setting for new sessions", async ({ page }) => {
  await page.goto("/settings");
  await page
    .getByRole("group", { name: "Readings per session" })
    .getByRole("button", { name: "1" })
    .click();
  await expect(page.getByRole("button", { name: "1", pressed: true })).toBeVisible();
  await page.goto("/bp/new");
  await expect(page.getByLabel(/^Systolic for reading/)).toHaveCount(1);

  await page.goto("/settings");
  await page
    .getByRole("group", { name: "Readings per session" })
    .getByRole("button", { name: "3" })
    .click();
  await expect(page.getByRole("button", { name: "3", pressed: true })).toBeVisible();
});

test("shows backup warnings that can't be dismissed", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Cloud backup (Cloudflare R2) isn't set up yet.")).toBeVisible();
  await expect(page.getByText("Daily export (Google Drive) isn't set up yet.")).toBeVisible();
});
