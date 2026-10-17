import { devices, webkit, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// Captures the main screens on an iPhone-sized viewport in light and dark mode, for reviewing
// design changes. Usage: node scripts/screenshots.ts <base-url> <output-dir>
const [baseUrl, outDir] = process.argv.slice(2);
if (baseUrl === undefined || outDir === undefined) {
  console.error("Usage: node scripts/screenshots.ts <base-url> <output-dir>");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const shots: { name: string; path: string; prepare?: (page: Page) => Promise<void> }[] = [
  { name: "summary", path: "/" },
  { name: "bp", path: "/bp" },
  {
    name: "bp-scrub",
    path: "/bp",
    prepare: async (page) => {
      const box = await page.locator(".range-chart svg").boundingBox();
      if (box === null) throw new Error("Chart not found");
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
    },
  },
  { name: "history", path: "/bp/history" },
  { name: "browse", path: "/browse" },
  { name: "settings", path: "/settings" },
  {
    name: "entry",
    path: "/bp/new",
    prepare: async (page) => {
      await page.getByRole("button", { name: "1", exact: true }).click();
      await page.getByRole("button", { name: "2", exact: true }).click();
    },
  },
  {
    name: "entry-rest",
    path: "/bp/new",
    prepare: async (page) => {
      for (const d of "1287962") await page.getByRole("button", { name: d, exact: true }).click();
    },
  },
  {
    name: "entry-review",
    path: "/bp/new",
    prepare: async (page) => {
      for (let i = 0; i < 3; i++) {
        for (const d of "1287962") await page.getByRole("button", { name: d, exact: true }).click();
        const start = page.getByRole("button", { name: "Start now" });
        if (await start.isVisible()) await start.click();
      }
    },
  },
];

const browser = await webkit.launch();
for (const scheme of ["light", "dark"] as const) {
  const context = await browser.newContext({
    ...devices["iPhone 15"],
    colorScheme: scheme,
    timezoneId: "Europe/London",
    locale: "en-GB",
    serviceWorkers: "block",
  });
  for (const shot of shots) {
    const page = await context.newPage();
    await page.goto(new URL(shot.path, baseUrl).toString());
    await page.waitForLoadState("networkidle");
    await shot.prepare?.(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(outDir, `${shot.name}-${scheme}.png`) });
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.close();
  }
  await context.close();
}
await browser.close();
console.log(`Saved screenshots to ${outDir}`);
