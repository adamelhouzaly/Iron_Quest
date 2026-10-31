import { expect, test } from '@playwright/test';
import { enterApp, watchConsole } from './helpers';

// Software WebGL: slow, but proves the scenes build and render with no errors.
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] } });

test('hero and chamber scenes render without errors', async ({ page }) => {
  test.setTimeout(120_000);
  const problems = watchConsole(page);
  await page.addInitScript(() => localStorage.setItem('iq.keep3d', '1'));
  await page.goto('./');
  await expect(page.getByTestId('hero-canvas')).toHaveClass(/opacity-100/, { timeout: 40_000 });
  await page.waitForTimeout(1500);
  expect(await page.getByTestId('fallback-world').count()).toBe(0);
  await enterApp(page);
  await page.goto('./#/app/chamber');
  await expect(page.getByRole('img', { name: /in the Chamber/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('char-level')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(problems).toEqual([]);
});

test('a device too slow for 3D falls back and stays usable', async ({ page }) => {
  test.setTimeout(90_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });
  await page.goto('./');
  // Software WebGL at 8x throttle is far harsher than any real phone, so allow time for startup.
  await page.getByTestId('armor-stage').first().click({ timeout: 30_000 });
  await expect(page.getByText('Recruit Rig')).toBeVisible();
  await expect(page.getByTestId('hero-canvas')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('fallback-world')).toBeVisible();
});
