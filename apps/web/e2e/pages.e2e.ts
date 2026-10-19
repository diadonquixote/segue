import { expect, test, type Page } from '@playwright/test';

const MORNING = new Date('2026-10-20T09:00:00+08:00'); // a Tuesday
const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };

/** Stand-ins for Google's sign-in script and the Calendar API. */
async function fakeGoogle(page: Page) {
  await page.route('https://accounts.google.com/gsi/client', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: `window.google = { accounts: { oauth2: {
        initTokenClient: (cfg) => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: 'fake', expires_in: 3600 }), 50) }),
        hasGrantedAllScopes: () => true, revoke: () => {} } } };`,
    }),
  );
  await page.route('https://www.googleapis.com/calendar/v3/users/me/calendarList**', (r) =>
    r.fulfill({ headers: cors, body: JSON.stringify({ items: [{ id: 'me@x', primary: true, selected: true }, { id: 'team@x', selected: true }] }) }),
  );
  await page.route('https://www.googleapis.com/calendar/v3/calendars/**', (r) => {
    const standup = { iCalUID: 'standup@x', summary: 'Team standup', location: 'Zoom', start: { dateTime: '2026-10-20T10:00:00+08:00' }, end: { dateTime: '2026-10-20T10:30:00+08:00' } };
    const items = r.request().url().includes('team%40x')
      ? [{ id: 't1', ...standup }]
      : [
          { id: 'p1', ...standup },
          { id: 'p2', summary: 'Dentist', start: { dateTime: '2026-10-20T15:00:00+08:00' }, end: { dateTime: '2026-10-20T16:00:00+08:00' } },
          { id: 'p3', summary: 'Ana birthday', start: { date: '2026-10-20' }, end: { date: '2026-10-21' } },
        ];
    return r.fulfill({ headers: cors, body: JSON.stringify({ items }) });
  });
}

async function onboard(page: Page, things: string[]) {
  await page.clock.setFixedTime(MORNING);
  await page.goto('/app?sky=clear');
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  for (const t of things) {
    await page.locator('#quick-add').fill(t);
    await page.keyboard.press('Enter');
  }
  await page.getByRole('button', { name: 'Plan my day' }).click();
  await expect(page.locator('.next')).toBeVisible();
}

test('the landing page explains Segue and opens the app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Re-route your day in one tap');
  await page.locator('#lp-try').fill('Groceries before 8');
  await expect(page.locator('.lp-try-result')).toContainText('Before 8 PM');
  await page.getByRole('button', { name: 'Storm' }).click();
  await expect(page.locator('.lp-phone')).toContainText("It's raining");
  await page.getByRole('link', { name: 'Plan my day' }).first().click();
  await expect(page).toHaveURL(/\/app(\?|$)/);
  await expect(page.getByRole('heading', { name: 'Plan your day around real life' })).toBeVisible();
});

test('plan my day: leave a routine out for today only', async ({ page }) => {
  await onboard(page, ['Lunch 12:30', 'Stretch 20 min every day']);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/plan(\?|$)/);
  await expect(page.getByRole('heading', { name: 'Plan your day' })).toBeVisible();
  await page.getByText('Include Stretch today').locator('..').locator('.track').click();
  await page.getByRole('button', { name: 'Re-plan my day' }).click();
  await page.getByRole('dialog', { name: 'Re-route from here' }).getByRole('button', { name: 'Use this plan' }).click();
  await expect(page).toHaveURL(/\/app(\?|$)/);
  await expect(page.locator('main')).not.toContainText('Stretch');
  await page.getByRole('button', { name: 'Routines' }).click();
  await expect(page.locator('main')).toContainText('Stretch'); // still a routine, back tomorrow
});

test('connect Google Calendar, leave one event out, and plan around the rest', async ({ page }) => {
  await fakeGoogle(page);
  await onboard(page, ['Lunch 12:30']);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.locator('.plan-page').getByRole('button', { name: 'Connect' }).click();
  await expect(page).toHaveURL(/\/app\/calendar(\?|$)/);
  await expect(page.getByText('Reads, never writes')).toBeVisible();

  await page.getByRole('button', { name: 'Connect Google Calendar' }).click();
  const events = page.locator('.event-list li');
  await expect(events).toHaveCount(2); // the standup is on two calendars; the birthday is all-day
  await events.filter({ hasText: 'Dentist' }).locator('.track').click();
  await expect(events.filter({ hasText: 'Dentist' })).toContainText("Left out of today's plan");

  await page.getByRole('button', { name: 'Plan my day around it' }).click();
  await page.getByRole('button', { name: 'Re-plan my day' }).click();
  await page.getByRole('dialog', { name: 'Re-route from here' }).getByRole('button', { name: 'Use this plan' }).click();
  await expect(page.locator('main')).toContainText('Team standup');
  await expect(page.locator('main')).not.toContainText('Dentist');

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('button', { name: 'Manage Google Calendar' })).toBeVisible();
});
