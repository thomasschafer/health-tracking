import { expect, test, type Page } from "@playwright/test";

async function setSettings(page: Page, readingsPerSession: number, restTimerSeconds: number) {
  const res = await page.request.put("/api/settings", {
    data: { readingsPerSession, restTimerSeconds },
  });
  expect(res.ok()).toBe(true);
}

async function press(page: Page, digits: string) {
  for (const digit of digits) {
    await page
      .getByRole("group", { name: "Number pad" })
      .getByRole("button", { name: digit, exact: true })
      .click();
  }
}

/** Enters a complete reading. A two-digit pulse completes the reading automatically. */
async function enterReading(page: Page, systolic: string, diastolic: string, pulse: string | null) {
  // Mirrors the app: a field completes on its own once another digit would exceed its maximum.
  await press(page, systolic);
  if (Number(`${systolic}0`) <= 300) await page.getByRole("button", { name: "Next" }).click();
  await press(page, diastolic);
  if (Number(`${diastolic}0`) <= 200) await page.getByRole("button", { name: "Next" }).click();
  if (pulse === null) await page.getByRole("button", { name: "Skip pulse" }).click();
  else await press(page, pulse);
}

const uniqueNote = (label: string) => `${label} ${crypto.randomUUID().slice(0, 8)}`;

test.beforeEach(async ({ page }) => {
  await setSettings(page, 3, 0);
});

test("records a session of three readings", async ({ page }) => {
  const note = uniqueNote("three readings");
  await page.goto("/");
  await page.getByRole("link", { name: "New blood pressure reading" }).click();
  await expect(page.getByText("Reading 1 of 3")).toBeVisible();
  await enterReading(page, "131", "81", "61");
  await expect(page.getByText("Reading 2 of 3")).toBeVisible();
  await enterReading(page, "128", "79", null);
  await enterReading(page, "125", "77", "63");

  await expect(page.getByText("Average of 3 readings")).toBeVisible();
  await expect(page.getByText("128/79 mmHg")).toBeVisible();
  await expect(page.getByText("62 bpm", { exact: true })).toBeVisible();
  await page.getByLabel("Note").fill(note);
  await page.getByRole("button", { name: "After caffeine" }).click();
  await page.getByRole("button", { name: "Save reading" }).click();

  await expect(page.getByText("Reading saved")).toBeVisible();
  await expect(page).toHaveURL("/");
  await page.goto("/bp/history");
  await expect(
    page.getByRole("link", { name: new RegExp(`128/79.*${note}, After caffeine`) }),
  ).toBeVisible();
});

test("rests between readings when the timer is on", async ({ page }) => {
  await setSettings(page, 2, 30);
  await page.goto("/bp/new");
  await enterReading(page, "128", "79", "62");
  await expect(page.getByText("Rest for a moment")).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText(/^(30|29|28)$/);
  await expect(page.getByText("Reading 1: 128/79 · 62 bpm")).toBeVisible();
  await page.getByRole("button", { name: "Start now" }).click();
  await expect(page.getByText("Reading 2 of 2")).toBeVisible();
});

test("blocks invalid readings and warns about unusual ones", async ({ page }) => {
  await page.goto("/bp/new");
  await enterReading(page, "85", "95", null);
  await expect(page.getByText("Systolic must be higher than diastolic")).toBeVisible();
  await expect(page.getByText("Reading 1 of 3")).toBeVisible();

  await page.getByRole("button", { name: /^Systolic/ }).click();
  await press(page, "190");
  await expect(page.getByText("This reading is very high.")).toBeVisible();
});

test("keeps an unsaved reading when the app is closed", async ({ page }) => {
  await page.goto("/bp/new");
  await enterReading(page, "128", "79", "62");
  await press(page, "13");
  await page.reload();
  await expect(page.getByText("Picked up where you left off.")).toBeVisible();
  await expect(page.getByText("Reading 2 of 3")).toBeVisible();
  await expect(page.getByTestId("field-systolic")).toHaveText(/^13/);

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByText("Reading 1 of 3")).toBeVisible();
  await expect(page.getByTestId("field-systolic")).not.toHaveText(/\d/);
});

test("asks before discarding entered values", async ({ page }) => {
  await page.goto("/bp");
  await page.getByRole("link", { name: "New blood pressure reading" }).click();
  await press(page, "12");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByTestId("field-systolic")).toHaveText(/^12/);
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page).toHaveURL("/bp");
});

test("edits, deletes and restores a session", async ({ page }) => {
  await setSettings(page, 1, 0);
  const note = uniqueNote("to edit");
  await page.goto("/bp/new");
  await enterReading(page, "120", "80", null);
  await page.getByLabel("Note").fill(note);
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByText("Reading saved")).toBeVisible();

  await page.goto("/bp/history");
  await page.getByRole("link", { name: new RegExp(note) }).click();
  await expect(page.getByText("Edit reading")).toBeVisible();
  await page.getByRole("button", { name: "After exercise" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Discard your changes?")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await page.getByRole("button", { name: "After exercise" }).click();
  await page.getByRole("button", { name: /^Reading 1/ }).click();
  await page.getByRole("button", { name: /^Systolic/ }).click();
  await press(page, "150");
  await page.getByRole("button", { name: /^Pulse/ }).click();
  await page.getByRole("button", { name: "Skip pulse" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
  const row = page.getByRole("link", { name: new RegExp(`150/80.*${note}`) });
  await expect(row).toBeVisible();

  await row.click();
  await page.getByRole("button", { name: "Delete reading" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Reading deleted")).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(note) })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("link", { name: new RegExp(note) })).toBeVisible();
});

test("changes the time a reading was taken", async ({ page }) => {
  await setSettings(page, 1, 0);
  const note = uniqueNote("back-filled");
  await page.goto("/bp/new");
  await enterReading(page, "122", "78", null);
  await page.getByRole("button", { name: /^Time/ }).click();
  await page.getByLabel("Time taken").fill("2026-01-10T07:45");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByLabel("Note").fill(note);
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByText("Reading saved")).toBeVisible();

  const res = await page.request.get("/api/bp/sessions");
  const { sessions } = (await res.json()) as {
    sessions: { note: string | null; takenAt: string }[];
  };
  expect(sessions.find((s) => s.note === note)?.takenAt).toBe("2026-01-10T07:45:00.000Z");
});

test.describe("offline", () => {
  // Requests made by a service worker bypass page.route in some browsers.
  test.use({ serviceWorkers: "block" });

  test("keeps readings on the device while the laptop is unreachable", async ({ page }) => {
    await setSettings(page, 1, 0);
    const note = uniqueNote("offline");
    await page.goto("/");
    await expect(page.getByRole("link", { name: "New blood pressure reading" })).toBeVisible();
    await page.route("**/api/**", (route) => route.abort("connectionrefused"));

    await page.getByRole("link", { name: "New blood pressure reading" }).click();
    await enterReading(page, "122", "82", null);
    await page.getByLabel("Note").fill(note);
    await page.getByRole("button", { name: "Save reading" }).click();
    await expect(page.getByText("Saved on this device. It will sync later.")).toBeVisible();
    await expect(page.getByText("1 reading is saved on this phone only.")).toBeVisible();
    await expect(page.getByText(/^Can't reach the laptop/)).toBeVisible();

    // The queue must survive the app being closed and reopened.
    await page.reload();
    await expect(page.getByText("1 reading is saved on this phone only.")).toBeVisible();
    await page.goto("/bp/history");
    await expect(page.getByRole("link", { name: new RegExp(`${note}.*Not synced`) })).toBeVisible();

    await page.unroute("**/api/**");
    await page.reload();
    await expect(page.getByText("saved on this phone only")).toHaveCount(0);
    await expect(page.getByRole("link", { name: new RegExp(note) })).toBeVisible();
    await expect(page.getByText("Not synced")).toHaveCount(0);
  });
});

test("uses the readings-per-session setting for new sessions", async ({ page }) => {
  await page.goto("/settings");
  await page
    .getByRole("group", { name: "Readings per session" })
    .getByRole("button", { name: "2" })
    .click();
  await expect(
    page
      .getByRole("group", { name: "Readings per session" })
      .getByRole("button", { name: "2", pressed: true }),
  ).toBeVisible();
  await page.goto("/bp/new");
  await expect(page.getByText("Reading 1 of 2")).toBeVisible();
});

test("shows the overview with a scrubbable chart", async ({ page }) => {
  await setSettings(page, 1, 0);
  await page.goto("/bp/new");
  await enterReading(page, "133", "84", null);
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByText("Reading saved")).toBeVisible();

  await page.goto("/bp");
  await page.getByRole("group", { name: "Time range" }).getByRole("button", { name: "W" }).click();
  await expect(page.getByText("Week average")).toBeVisible();
  await page.getByRole("img", { name: /range chart/ }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".readout-detail")).toHaveText(/^\d+ sessions?/);

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Blood pressure", exact: true })).toBeVisible();
  await expect(page.getByText("Latest")).toBeVisible();
});

test("shows a backup warning that can't be dismissed", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("Cloud backup isn't set up yet, so your data only exists on the laptop."),
  ).toBeVisible();

  await expect(page.getByRole("button", { name: /dismiss|close/i })).toHaveCount(0);
});

test("builds a report for a chosen period", async ({ page }) => {
  await setSettings(page, 1, 0);
  await page.goto("/bp/new");
  await enterReading(page, "141", "91", "70");
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByText("Reading saved")).toBeVisible();

  await page.goto("/bp");
  await page.getByRole("link", { name: /Report for your doctor/ }).click();
  await page
    .getByRole("group", { name: "Report period" })
    .getByRole("button", { name: "7 days" })
    .click();
  await expect(page.getByRole("heading", { name: "Home blood pressure readings" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "141/91", exact: true }).first()).toBeVisible();

  await page
    .getByRole("group", { name: "Report period" })
    .getByRole("button", { name: "Custom" })
    .click();
  await page.getByLabel("From").fill("2026-10-20");
  await page.getByLabel("To").fill("2026-10-10");
  await expect(page.getByText("Choose a start date before the end date.")).toBeVisible();
});

test.describe("exporting", () => {
  test("shares a full export and records it", async ({ page }) => {
    // Stands in for the phone's share sheet, recording what was shared.
    await page.addInitScript(() => {
      const shared: string[] = [];
      Object.assign(globalThis, { sharedFiles: shared });
      Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
      Object.defineProperty(navigator, "share", {
        value: (data: { files: File[] }) => {
          shared.push(...data.files.map((f) => `${f.name}:${f.type}:${String(f.size > 0)}`));
          return Promise.resolve();
        },
        configurable: true,
      });
    });
    await page.goto("/settings");
    await page.getByRole("button", { name: /Export all data/ }).click();
    const sheet = page.getByRole("dialog", { name: "Export all data" });
    await expect(sheet.getByText(/^health-export-\d{4}-\d{2}-\d{2}\.json\.txt$/)).toBeVisible();
    await sheet.getByRole("button", { name: "Share…" }).click();
    await expect(page.getByText("Export saved")).toBeVisible();
    const shared = await page.evaluate(
      () => (globalThis as unknown as { sharedFiles: string[] }).sharedFiles,
    );
    expect(shared).toEqual([
      expect.stringMatching(/^health-export-.*\.json\.txt:text\/plain:true$/),
      expect.stringMatching(/^blood-pressure-.*\.csv:text\/csv:true$/),
    ]);
    await expect(page.getByText(/Last exported (just now|\d+ seconds? ago)/)).toBeVisible();
    await expect(page.getByText("Save a copy of your data somewhere safe")).toHaveCount(0);
  });

  test("offers a download when sharing is refused", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
      Object.defineProperty(navigator, "share", {
        value: () => Promise.reject(new DOMException("Permission denied", "NotAllowedError")),
        configurable: true,
      });
    });
    await page.goto("/settings");
    await page.getByRole("button", { name: /Export all data/ }).click();
    await page.getByRole("button", { name: "Share…" }).click();
    await expect(page.getByText("Couldn't export: Permission denied")).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download files instead" }).click();
    expect((await download).suggestedFilename()).toMatch(/^health-export-.*\.json\.txt$/);
    await expect(page.getByText("Export saved")).toBeVisible();
  });

  test("downloads the files where sharing isn't available", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
    });
    await page.goto("/settings");
    await page.getByRole("button", { name: /Export all data/ }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download files" }).click();
    expect((await download).suggestedFilename()).toMatch(/^health-export-.*\.json\.txt$/);
  });
});
