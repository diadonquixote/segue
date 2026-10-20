import { expect, test, type Page } from '@playwright/test';

/** Finish first-run setup quickly with the example day. */
async function setUp(page: Page, url: string, at: string) {
  await page.clock.setFixedTime(new Date(at));
  await page.goto(url);
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Try an example day' }).click();
  await expect(page.locator('main')).toBeVisible();
}

/** The page background as [r, g, b]. */
const background = (page: Page) =>
  page.evaluate(() => {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g)!.map(Number);
    return [m[0]!, m[1]!, m[2]!] as [number, number, number];
  });
const lightness = ([r, g, b]: number[]) => (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;

test.describe('the page takes on the sky', () => {
  test.use({ colorScheme: 'light' });

  test('dark under a night sky, even with a light system theme', async ({ page }) => {
    await setUp(page, '/app?sky=clear', '2026-10-20T21:00:00+08:00');
    await expect(page.locator('html')).toHaveAttribute('data-sky-theme', 'dark');
    await expect.poll(async () => lightness(await background(page))).toBeLessThan(0.15);
  });

  test('light and sky-tinted at noon', async ({ page }) => {
    await setUp(page, '/app?sky=clear', '2026-10-20T12:00:00+08:00');
    await expect(page.locator('html')).toHaveAttribute('data-sky-theme', 'light');
    await expect.poll(async () => lightness(await background(page))).toBeGreaterThan(0.8);
    const [r, , b] = await background(page);
    expect(b).toBeGreaterThan(r); // a little blue from the sky
  });
});
