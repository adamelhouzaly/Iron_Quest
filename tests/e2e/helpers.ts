import { expect, type Page } from '@playwright/test';

export const APP = '#/app';

/** Fails a test on any uncaught exception or console error. */
export function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  return problems;
}

export async function enterApp(page: Page, hash = APP, opts: { unit?: 'kg' | 'lb' } = {}) {
  await page.goto(`./${hash}`);
  const skip = page.getByTestId('onboard-go');
  await skip.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
  if (await skip.isVisible()) {
    await page.getByRole('button', { name: opts.unit ?? 'kg', exact: true }).click();
    await skip.click();
    await expect(skip).toBeHidden();
  }
}

export async function addExercise(page: Page, name: string) {
  await page.getByPlaceholder('Search name, muscle, equipment').fill(name);
  await page.getByRole('button', { name: new RegExp(`^${name}\\b`) }).first().click();
  await page.getByTestId('picker-add').click();
}

export async function startBlank(page: Page) {
  await page.goto('./#/app/workout');
  await page.getByTestId('start-blank').click();
}

/** Fills one row of the set table and completes it. */
export async function logSet(page: Page, cardIndex: number, setIndex: number, weight: string, reps: string) {
  const row = page.getByTestId('exercise-card').nth(cardIndex).getByTestId('set-row').nth(setIndex);
  await row.getByLabel(/weight in/).fill(weight);
  await row.getByLabel(/reps$/).fill(reps);
  await row.getByTestId('set-check').click();
  await expect(row.getByTestId('set-check')).toHaveAttribute('aria-pressed', 'true');
}

/** Saves the current workout, reporting a realistic duration, and lands on the completion screen. */
export async function finish(page: Page, minutes = '45') {
  await page.getByTestId('finish').click();
  await page.getByTestId('review-minutes').fill(minutes);
  await page.getByTestId('save-workout').click();
  await expect(page.getByTestId('xp-gained')).toBeVisible();
}

export const skipRest = async (page: Page) => {
  const skip = page.getByRole('timer').getByRole('button', { name: 'Skip' });
  if (await skip.isVisible()) await skip.click();
};

/** A complete, simple session via the real UI. */
export async function quickWorkout(page: Page, name: string, weight: string, reps = '5', sets = 3) {
  await startBlank(page);
  await page.getByLabel('Workout name').fill(name);
  await page.getByTestId('add-first').click();
  await addExercise(page, 'Barbell Bench Press');
  for (let i = 0; i < sets; i++) await logSet(page, 0, i, weight, reps);
  await skipRest(page);
  await finish(page);
  await page.getByTestId('complete-done').click();
}
