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
    // the status bar matches the top of the night sky
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#050918');
  });

  test('light and sky-tinted at noon', async ({ page }) => {
    await setUp(page, '/app?sky=clear', '2026-10-20T12:00:00+08:00');
    await expect(page.locator('html')).toHaveAttribute('data-sky-theme', 'light');
    await expect.poll(async () => lightness(await background(page))).toBeGreaterThan(0.8);
    const [r, , b] = await background(page);
    expect(b).toBeGreaterThan(r); // a little blue from the sky
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#1c5fb8');
  });

  test('the status bar starts neutral, before the app knows the sky', async ({ page }) => {
    await page.route('**/src/main.tsx', (r) => r.abort()); // the page before any script runs
    await page.goto('/app');
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#f2f4f8');
  });
});

test.describe('where the sky is', () => {
  test('says plainly when it is showing Manila instead of the user', async ({ page, context }) => {
    await context.clearPermissions(); // location not allowed
    await setUp(page, '/app?sky=clear', '2026-10-20T10:00:00+08:00');
    await expect(page.locator('.where-button')).toHaveText('Showing Manila. Tap to use your location.');
    await expect(page.locator('.precautions')).toHaveCount(0); // not the user's weather
  });

  test("names the user's area beside the pin", async ({ page }) => {
    await page.route('http://127.0.0.1:9/v1/place-name**', (r) =>
      r.fulfill({ headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Urdaneta, Makati' }) }),
    );
    await setUp(page, '/app?sky=clear', '2026-10-20T10:00:00+08:00');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /Use my location|Update my location/ }).click();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('.where-button')).toHaveText('Urdaneta, Makati');
  });
});

test('the status bar goes back to neutral on the landing page', async ({ page }) => {
  await setUp(page, '/app?sky=clear', '2026-10-20T21:00:00+08:00');
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#050918');
  await page.evaluate(() => {
    history.pushState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('.lp-hero')).toBeVisible();
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#f2f4f8');
});

test('previews any time and place from the address bar', async ({ page }) => {
  // noon on the device, but the preview asks for 9 PM
  await setUp(page, '/app?sky=clear&time=21:00', '2026-10-20T12:00:00+08:00');
  await expect(page.locator('html')).toHaveAttribute('data-sky-theme', 'dark');
  await expect(page.locator('.condition')).toHaveText('Clear night');
  // dusk in Manila is 5:45 PM
  await page.goto('/app?sky=clear&time=17:45');
  await expect(page.locator('.condition')).toHaveText('Clear sky');
  // and somewhere else: midday in Sydney is daytime there
  await page.goto('/app?sky=clear&time=12:00&lat=-33.87&lng=151.21');
  await expect(page.locator('.condition')).toHaveText('Clear and sunny');
});
