import { expect, test } from '@playwright/test';
import { addExercise, enterApp, finish, logSet, quickWorkout, skipRest, startBlank, watchConsole } from './helpers';

test.describe('critical flows (local mode)', () => {
  test('1–7: start, log, complete; history, analytics and XP update; all survives reload', async ({ page }) => {
    const problems = watchConsole(page);
    await enterApp(page);

    // 1. Start a workout
    await startBlank(page);
    await page.getByLabel('Workout name').fill('Test Push');

    // 2. Add an exercise and sets
    await page.getByTestId('add-first').click();
    await addExercise(page, 'Barbell Bench Press');
    const card = page.getByTestId('exercise-card').first();
    await expect(card.getByTestId('set-row')).toHaveCount(3);
    await card.getByTestId('add-set').click();
    await expect(card.getByTestId('set-row')).toHaveCount(4);

    // 3. Log weight and reps
    await logSet(page, 0, 0, '100', '5');
    await logSet(page, 0, 1, '100', '5');
    await logSet(page, 0, 2, '100', '5');
    await expect(page.getByTestId('done-count')).toHaveText('3');
    await expect(page.getByTestId('live-volume')).toContainText('1,500');
    await expect(page.getByRole('timer')).toBeVisible(); // auto rest started
    await skipRest(page);

    // 4. Complete it. The unfinished 4th set must be flagged and dropped.
    await page.getByTestId('finish').click();
    await expect(page.getByText(/1 unchecked set is not counted/)).toBeVisible();
    await page.getByTestId('review-minutes').fill('40');
    await page.getByTestId('save-workout').click();
    await expect(page.getByTestId('xp-gained')).toBeVisible();
    await expect(page.getByText('3 working sets')).toBeVisible();

    // 5. History and analytics update
    await page.goto('./#/app/history');
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await expect(page.getByTestId('history-row')).toContainText('Test Push');
    await expect(page.getByTestId('history-row')).toContainText('3 sets');
    await page.goto('./#/app/analytics');
    await expect(page.getByTestId('a-workouts')).toHaveText('1');
    await expect(page.getByTestId('a-sets')).toHaveText('3');
    await expect(page.getByTestId('a-volume')).toContainText('1,500');
    const xpBefore = await (async () => { await page.goto('./#/app/chamber'); return page.getByTestId('char-xp').innerText(); })();

    // 6–7. Reload: everything remains
    await page.reload();
    await expect(page.getByTestId('char-xp')).toHaveText(xpBefore);
    await page.goto('./#/app/history');
    await expect(page.getByTestId('history-row')).toContainText('Test Push');
    await page.getByTestId('history-row').click();
    await expect(page.getByTestId('detail-exercise')).toContainText('100 kg × 5');
    await expect(page.getByTestId('detail-exercise').locator('tr')).toHaveCount(3);
    expect(problems).toEqual([]);
  });

  test('8: create a routine and reuse it, with previous values shown', async ({ page }) => {
    await enterApp(page);
    await page.goto('./#/app/routines');
    await page.getByTestId('new-routine').click();
    await page.getByTestId('routine-name').fill('My Upper Day');
    await page.getByTestId('routine-add-exercise').click();
    await addExercise(page, 'Overhead Press');
    await page.getByTestId('routine-exercise').getByTestId('routine-add-set').click();
    await page.getByRole('button', { name: 'Mon', exact: true }).click();
    await page.getByTestId('save-routine').click();
    await expect(page.getByText('Routine saved')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('routine-name')).toHaveValue('My Upper Day');

    await page.goto('./#/app/routines');
    await expect(page.getByTestId('routine-card')).toContainText('My Upper Day');
    await page.getByTestId('routine-start').click();
    await expect(page.getByTestId('exercise-card').first().getByTestId('set-row')).toHaveCount(4);
    for (let i = 0; i < 3; i++) await logSet(page, 0, i, '50', '8');
    await skipRest(page);
    await finish(page);
    await expect(page.getByText('Followed a routine').first()).toBeVisible();

    // Reuse: second run shows last time's numbers and logs them with one tap.
    await page.goto('./#/app/routines');
    await page.getByTestId('routine-start').click();
    const row = page.getByTestId('exercise-card').first().getByTestId('set-row').first();
    await expect(row).toContainText('50×8');
    await row.getByTestId('set-check').click();
    await expect(row.getByTestId('set-check')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('live-volume')).toContainText('400');
  });

  test('9–10: editing or deleting a past workout recalculates PRs, totals and XP', async ({ page }) => {
    await enterApp(page);
    await quickWorkout(page, 'Base', '100');
    // Two sessions in one day pay less XP, so back-date the first to compare cleanly.
    await page.goto('./#/app/history');
    await page.getByTestId('history-row').click();
    await page.getByTestId('edit-workout').click();
    const finished = page.getByLabel('Finished at');
    const lastWeek = new Date(Date.now() - 8 * 864e5);
    lastWeek.setMinutes(lastWeek.getMinutes() - lastWeek.getTimezoneOffset());
    await finished.fill(lastWeek.toISOString().slice(0, 16));
    await page.getByTestId('save-edit').click();
    await expect(page.getByText('Session updated').first()).toBeVisible();

    await quickWorkout(page, 'Heavy', '120');

    const e1rm = () => page.getByTestId('records-table').getByTestId('record-e1rm').first();
    const openRecords = async () => { await page.goto('./#/app/analytics'); await page.getByRole('tab', { name: 'Records' }).click(); };
    await openRecords();
    await expect(e1rm()).toHaveText('140'); // 120 × (1 + 5/30)

    await page.goto('./#/app/history');
    const heavy = page.getByTestId('history-row').filter({ hasText: 'Heavy' });
    await expect(heavy).toContainText('PR');
    await heavy.click();

    // Edit: lower the record set. It must stop being a record everywhere.
    await page.getByTestId('edit-workout').click();
    for (let i = 0; i < 3; i++) await page.getByTestId('set-row').nth(i).getByLabel(/weight in/).fill('90');
    await page.getByTestId('save-edit').click();
    await expect(page.getByText('Session updated').first()).toBeVisible();
    await openRecords();
    await expect(e1rm()).toHaveText('116.7'); // back to the 100 × 5 session
    await page.goto('./#/app/history');
    await expect(page.getByTestId('history-row').filter({ hasText: 'Heavy' })).not.toContainText('PR');

    await page.goto('./#/app/chamber');
    const xpBeforeDelete = await page.getByTestId('char-xp').innerText();

    // Delete: totals and XP fall, and the deletion persists through a reload.
    await page.goto('./#/app/history');
    await page.getByTestId('history-row').filter({ hasText: 'Heavy' }).click();
    await page.getByTestId('delete-workout').click();
    await page.getByTestId('confirm-yes').click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await page.reload();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await page.goto('./#/app/analytics');
    await expect(page.getByTestId('a-workouts')).toHaveText('1');
    await expect(page.getByTestId('a-sets')).toHaveText('3');
    await page.goto('./#/app/chamber');
    expect(await page.getByTestId('char-xp').innerText()).not.toBe(xpBeforeDelete);
    // Deleting the only record-setter's successor leaves the original record standing.
    await page.goto('./#/app/analytics');
    await page.getByRole('tab', { name: 'Records' }).click();
    await expect(e1rm()).toHaveText('116.7');
  });

  test('logging a past workout: backing out leaves nothing; saving records real sets', async ({ page }) => {
    await enterApp(page);
    await page.goto('./#/app/history');
    await page.getByTestId('log-past').click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('history-row')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('history-row')).toHaveCount(0);

    await page.getByTestId('log-past').click();
    await page.getByTestId('save-edit').click();
    await expect(page.getByText('Nothing to save')).toBeVisible();
    await page.getByTestId('edit-add-exercise').click();
    await addExercise(page, 'Leg Press');
    await logSet(page, 0, 0, '120', '10');
    await page.getByTestId('save-edit').click();
    await expect(page.getByTestId('detail-exercise')).toContainText('120 kg × 10');
    await page.goto('./#/app/history');
    await expect(page.getByTestId('history-row')).toHaveCount(1);
  });

  test('deleting a workout offers a working undo', async ({ page }) => {
    await enterApp(page);
    await quickWorkout(page, 'Oops', '60');
    await page.goto('./#/app/history');
    await page.getByTestId('history-row').click();
    await page.getByTestId('delete-workout').click();
    await page.getByTestId('confirm-yes').click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await page.reload();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
  });

  test('11: local mode: cloud-dependent screens stay honest and nothing calls a backend', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => { const u = new URL(r.url()); if (u.hostname !== 'localhost' && !u.protocol.startsWith('data') && !u.protocol.startsWith('blob')) external.push(r.url()); });
    const problems = watchConsole(page);
    await enterApp(page);
    await page.goto('./#/app/community');
    await expect(page.getByRole('heading', { name: /isn't connected on this site/ })).toBeVisible();
    await expect(page.getByTestId('post')).toHaveCount(0);
    await page.goto('./#/app/profile');
    await expect(page.getByText('local mode')).toBeVisible();
    await quickWorkout(page, 'Offline-ready', '40');
    await page.goto('./#/app/history');
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
  });
});

test.describe('active workout safety', () => {
  test('a draft resumes after reload with every value, and through a closed tab', async ({ page, context }) => {
    await enterApp(page);
    await startBlank(page);
    await page.getByTestId('add-first').click();
    await addExercise(page, 'Barbell Squat');
    await logSet(page, 0, 0, '80', '6');
    await skipRest(page);
    const row2 = page.getByTestId('exercise-card').first().getByTestId('set-row').nth(1);
    await row2.getByLabel(/weight in/).fill('85');
    await page.getByLabel('Workout name').fill('Interrupted');

    await page.reload();
    await expect(page.getByLabel('Workout name')).toHaveValue('Interrupted');
    await expect(page.getByTestId('done-count')).toHaveText('1');
    const again = page.getByTestId('exercise-card').first().getByTestId('set-row').nth(1);
    await expect(again.getByLabel(/weight in/)).toHaveValue('85');

    const second = await context.newPage();
    await page.close();
    await second.goto('./#/app');
    await expect(second.getByTestId('resume-strip')).toBeVisible();
    await second.getByTestId('resume-strip').click();
    await expect(second.getByLabel('Workout name')).toHaveValue('Interrupted');
  });

  test('invalid values are refused, and an empty workout cannot be finished', async ({ page }) => {
    await enterApp(page);
    await startBlank(page);
    await page.getByTestId('finish').click();
    await expect(page.getByText('Complete at least one set first')).toBeVisible();
    await page.getByTestId('add-first').click();
    await addExercise(page, 'Barbell Bench Press');
    const row = page.getByTestId('set-row').first();
    await row.getByTestId('set-check').click();
    await expect(page.getByText('Enter weight and reps first.')).toBeVisible();
    await expect(row.getByTestId('set-check')).toHaveAttribute('aria-pressed', 'false');
    const w = row.getByLabel(/weight in/);
    await w.fill('abc');
    await expect(w).toHaveAttribute('aria-invalid', 'true');
    await w.fill('99999');
    await expect(w).toHaveAttribute('aria-invalid', 'true');
    await row.getByLabel(/reps$/).fill('2.5');
    await expect(row.getByLabel(/reps$/)).toHaveAttribute('aria-invalid', 'true');
  });

  test('sets: types, RPE, duplicate, delete; exercises: reorder and superset', async ({ page }) => {
    await enterApp(page);
    await startBlank(page);
    await page.getByTestId('add-first').click();
    await addExercise(page, 'Barbell Bench Press');
    await page.getByTestId('add-exercise').click();
    await addExercise(page, 'Barbell Row');
    const first = page.getByTestId('exercise-card').first();
    await first.getByTestId('set-menu').first().click();
    await page.getByRole('button', { name: 'Warm-up' }).click();
    await page.getByRole('button', { name: '8.5' }).click();
    await page.getByRole('button', { name: 'Duplicate' }).click();
    await expect(first.getByTestId('set-row')).toHaveCount(4);
    await first.getByTestId('set-menu').nth(1).click();
    await page.getByTestId('set-delete').click();
    await expect(first.getByTestId('set-row')).toHaveCount(3);

    await page.getByTestId('exercise-card').nth(1).getByTestId('exercise-menu').click();
    await page.getByTestId('move-up').click();
    await expect(page.getByTestId('exercise-card').first()).toContainText('Barbell Row');

    await page.getByTestId('exercise-card').first().getByTestId('exercise-menu').click();
    await page.getByTestId('link-superset').click();
    await expect(page.getByText('Superset: rest after the last exercise')).toBeVisible();
    // Inside a superset, completing the first exercise's set must not start rest.
    await logSet(page, 0, 0, '60', '10');
    await expect(page.getByRole('timer')).toBeHidden();
    await logSet(page, 1, 1, '60', '10');
    await expect(page.getByRole('timer')).toBeVisible();
  });

  test('live PR alert fires when a set beats history', async ({ page }) => {
    await enterApp(page);
    await quickWorkout(page, 'Baseline', '100');
    await startBlank(page);
    await page.getByTestId('add-first').click();
    await addExercise(page, 'Barbell Bench Press');
    await logSet(page, 0, 0, '105', '5');
    await expect(page.getByText('New personal record')).toBeVisible();
  });
});

test.describe('data safety', () => {
  const V1 = {
    xp: 700, totalVolume: 12000, totalSets: 12, streak: 1, lastWorkoutDate: '2026-01-02',
    history: [{ split: 'Push', completedAt: '2026-01-02T18:00:00.000Z', volume: 12000, completedSets: 12, xpEarned: 700, newPRs: [{ name: 'Barbell Bench Press', weight: 225, reps: 5, e1rm: 262.5 }] }],
    prs: { 'Barbell Bench Press': { weight: 225, reps: 5, e1rm: 262.5, date: '2026-01-02T18:00:00.000Z' } },
  };

  test('v1 data migrates intact, the original key is untouched, and migration runs once', async ({ page }) => {
    const raw = JSON.stringify(V1);
    await page.addInitScript((v) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ironQuestDataV1', v); sessionStorage.setItem('seeded', '1'); } }, raw);
    const problems = watchConsole(page);
    await enterApp(page, '#/app', { unit: 'lb' });
    await expect(page.getByText(/Your earlier Iron Quest data came with you: 1 session/)).toBeVisible();
    await page.goto('./#/app/history');
    await expect(page.getByTestId('history-row')).toContainText('Push Day');
    await expect(page.getByTestId('history-row')).toContainText('12 sets');
    await expect(page.getByTestId('history-row')).toContainText('12k lb');
    await page.getByTestId('history-row').click();
    await expect(page.getByText('Imported from Iron Quest v1')).toBeVisible();
    await expect(page.getByText('Barbell Bench Press: 225 lb × 5')).toBeVisible();
    await page.goto('./#/app/chamber');
    await expect(page.getByTestId('char-xp')).toContainText('700 total');
    expect(await page.evaluate(() => localStorage.getItem('ironQuestDataV1'))).toBe(raw);

    // Second load: no duplicates.
    await page.reload();
    await page.goto('./#/app/history');
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await page.goto('./#/app/analytics');
    await page.getByRole('tab', { name: 'Records' }).click();
    await expect(page.getByTestId('record-e1rm').first()).toHaveText('262.5');
    expect(problems).toEqual([]);
  });

  test('a deleted v1 session stays deleted after reload', async ({ page }) => {
    await page.addInitScript((v) => localStorage.setItem('ironQuestDataV1', v), JSON.stringify(V1));
    await enterApp(page, '#/app', { unit: 'lb' });
    await page.goto('./#/app/history');
    await page.getByTestId('history-row').click();
    await page.getByTestId('delete-workout').click();
    await page.getByTestId('confirm-yes').click();
    await expect(page.getByTestId('history-row')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('history-row')).toHaveCount(0);
  });

  test('corrupt v1 data does not break the app', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ironQuestDataV1', '{broken'));
    const problems = watchConsole(page);
    await enterApp(page);
    await expect(page.getByTestId('kpi-workouts')).toHaveText('0');
    expect(problems).toEqual([]);
  });

  test('JSON backup round-trips into an empty browser; a bad file changes nothing', async ({ page, browser }) => {
    await enterApp(page);
    await quickWorkout(page, 'Backed up', '70');
    await page.goto('./#/app/profile');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()]);
    const path = await dl.path();

    const ctx = await browser.newContext({ baseURL: 'http://localhost:4173/Iron_Quest/' });
    const fresh = await ctx.newPage();
    await enterApp(fresh);
    await fresh.goto('./#/app/profile');
    await fresh.getByTestId('import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    await expect(fresh.getByText('That file is not an Iron Quest backup.')).toBeVisible();
    await fresh.getByTestId('import-file').setInputFiles(path);
    await fresh.getByTestId('import-commit').click();
    await expect(fresh.getByText('Import complete')).toBeVisible();
    await fresh.goto('./#/app/history');
    await expect(fresh.getByTestId('history-row')).toContainText('Backed up');
    await ctx.close();
  });

  test('CSV round-trips, and user text cannot inject spreadsheet formulas', async ({ page, browser }) => {
    await enterApp(page);
    await startBlank(page);
    await page.getByLabel('Workout name').fill('=HYPERLINK("evil")');
    await page.getByTestId('add-first').click();
    await addExercise(page, 'Leg Press');
    await logSet(page, 0, 0, '150', '10');
    await skipRest(page);
    await finish(page);
    await page.goto('./#/app/profile');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()]);
    const fs = await import('node:fs/promises');
    const csv = await fs.readFile((await dl.path())!, 'utf8');
    expect(csv).toContain(`"'=HYPERLINK(""evil"")"`);

    const ctx = await browser.newContext({ baseURL: 'http://localhost:4173/Iron_Quest/' });
    const fresh = await ctx.newPage();
    await enterApp(fresh);
    await fresh.goto('./#/app/profile');
    await fresh.getByTestId('import-file').setInputFiles({ name: 'w.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await fresh.getByTestId('import-commit').click();
    await fresh.goto('./#/app/history');
    await expect(fresh.getByTestId('history-row')).toContainText('1 sets');
    await ctx.close();
  });

  test('user-controlled text is rendered as text, never as HTML', async ({ page }) => {
    let alerted = false;
    page.on('dialog', (d) => { alerted = true; void d.dismiss(); });
    await enterApp(page);
    const evil = '<img src=x onerror=alert(1)>';
    await startBlank(page);
    await page.getByLabel('Workout name').fill(evil);
    await page.getByTestId('add-first').click();
    await addExercise(page, 'Leg Press');
    await logSet(page, 0, 0, '100', '10');
    await skipRest(page);
    await finish(page);
    await page.goto('./#/app/history');
    await expect(page.getByTestId('history-row')).toContainText(evil);
    await page.getByTestId('history-row').click();
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    expect(alerted).toBe(false);
  });

  test('unsaved routine edits are guarded on navigation', async ({ page }) => {
    await enterApp(page);
    await page.goto('./#/app/routines');
    await page.getByTestId('new-routine').click();
    await page.getByTestId('routine-name').fill('Changed');
    await page.locator('nav[aria-label="Primary"]:visible a').first().click();
    await expect(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('routine-name')).toHaveValue('Changed');
  });
});

test.describe('features', () => {
  test('custom exercises persist and are usable', async ({ page }) => {
    await enterApp(page);
    await page.goto('./#/app/exercises');
    await page.getByTestId('new-exercise').click();
    await page.getByTestId('exercise-name').fill('Barbell Bench Press');
    await expect(page.getByText('An exercise with this name already exists.')).toBeVisible();
    await page.getByTestId('exercise-name').fill('Sandbag Shouldering');
    await page.getByTestId('save-exercise').click();
    await expect(page.getByRole('heading', { name: 'Sandbag Shouldering' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sandbag Shouldering' })).toBeVisible();
    await startBlank(page);
    await page.getByTestId('add-first').click();
    await addExercise(page, 'Sandbag Shouldering');
    await expect(page.getByTestId('exercise-card')).toContainText('Sandbag Shouldering');
  });

  test('library search and filters work, detail shows guidance', async ({ page }) => {
    await enterApp(page);
    await page.goto('./#/app/exercises');
    await page.getByTestId('ex-search').fill('romanian');
    await expect(page.getByTestId('ex-count')).toHaveText('1 shown');
    await page.getByRole('link', { name: /Romanian Deadlift/ }).click();
    await expect(page.getByRole('heading', { name: 'Execution' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Form' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Back view/ })).toBeVisible();
  });

  test('program templates install; routines duplicate, share and import', async ({ page }) => {
    await enterApp(page);
    await page.goto('./#/app/routines');
    await page.getByTestId('open-templates').click();
    await page.getByTestId('install-ppl').click();
    await expect(page.getByTestId('routine-card')).toHaveCount(3);
    const card = page.getByTestId('routine-card').filter({ hasText: 'Push Day' });
    await card.getByTestId('routine-menu').click();
    await page.getByTestId('routine-duplicate').click();
    await expect(page.getByTestId('routine-card')).toHaveCount(4);
    await card.first().getByTestId('routine-menu').click();
    await page.getByTestId('routine-share').click();
    const code = await page.getByTestId('share-code').inputValue();
    expect(code.length).toBeGreaterThan(50);
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).last().click();
    await page.getByRole('button', { name: 'Import' }).click();
    await page.getByTestId('import-code').fill('garbage!');
    await page.getByTestId('import-go').click();
    await expect(page.getByText('That share code is not valid.')).toBeVisible();
    await page.getByTestId('import-code').fill(code);
    await page.getByTestId('import-go').click();
    await expect(page.getByTestId('routine-card')).toHaveCount(5);
  });

  test('tools calculate correct numbers', async ({ page }) => {
    await enterApp(page);
    await page.goto('./#/app/tools');
    await page.getByTestId('plate-target').fill('100');
    await expect(page.getByTestId('plate-result')).toContainText('25');
    await expect(page.getByTestId('plate-result')).toContainText('15');
    await page.getByTestId('orm-weight').fill('100');
    await page.getByTestId('orm-reps').fill('10');
    await expect(page.getByTestId('orm-result')).toContainText('133.3');
    await page.getByTestId('conv-kg').fill('100');
    await expect(page.getByTestId('conv-lb')).toHaveValue('220.46');
    await page.getByTestId('vol-weight').fill('50');
    await expect(page.getByTestId('vol-result')).toContainText('1,500');
    await page.getByTestId('warmup-work').fill('100');
    await expect(page.getByTestId('warmup-result').locator('tr').first()).toContainText('20');
  });

  test('switching units changes display only, not stored data', async ({ page }) => {
    await enterApp(page);
    await quickWorkout(page, 'Units', '100');
    await page.goto('./#/app/profile');
    await page.getByTestId('unit-lb').click();
    await page.goto('./#/app/history');
    await page.getByTestId('history-row').click();
    await expect(page.getByTestId('detail-exercise')).toContainText('220.46 lb × 5');
    await page.goto('./#/app/profile');
    await page.getByTestId('unit-kg').click();
    await page.goto('./#/app/history');
    await page.getByTestId('history-row').click();
    await expect(page.getByTestId('detail-exercise')).toContainText('100 kg × 5');
  });

  test('body entries save, validate and delete', async ({ page }) => {
    await enterApp(page);
    await page.goto('./#/app/body');
    await page.getByTestId('body-weight').fill('9999');
    await page.getByTestId('body-save').click();
    await expect(page.getByText(/out of range/)).toBeVisible();
    await page.getByTestId('body-weight').fill('80.5');
    await page.getByTestId('body-save').click();
    await expect(page.getByTestId('body-row')).toContainText('80.5 kg');
    await page.reload();
    await expect(page.getByTestId('body-row')).toContainText('80.5 kg');
  });

  test('progress photos are added on-device, persist and delete', async ({ page }) => {
    await enterApp(page);
    await page.goto('./#/app/body');
    await page.getByRole('tab', { name: 'Photos' }).click();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/7yMK/gAAAABJRU5ErkJggg==', 'base64');
    await page.getByTestId('photo-input').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByTestId('photo')).toHaveCount(1);
    await page.getByTestId('photo-input').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('nope') });
    await expect(page.getByText('Photo not added')).toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: 'Photos' }).click();
    await page.getByTestId('photo').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await page.getByTestId('confirm-yes').click();
    await expect(page.getByTestId('photo')).toHaveCount(0);
  });

  test('skills, loadout and goals work and persist', async ({ page }) => {
    await enterApp(page);
    await page.goto('./#/app/quests');
    await page.getByTestId('new-goal').click();
    await page.getByTestId('save-goal').click();
    await expect(page.getByTestId('goal')).toContainText('Raise');
    await page.reload();
    await expect(page.getByTestId('goal')).toHaveCount(1);
    await page.goto('./#/app/chamber');
    await page.getByTestId('char-name-input').fill('Kael');
    await expect(page.getByTestId('char-name')).toHaveText('Kael');
    await page.getByRole('tab', { name: /Skills/ }).click();
    await expect(page.getByTestId('skill-points')).toHaveText('0');
    await page.reload();
    await expect(page.getByTestId('char-name')).toHaveText('Kael');
  });
});

test.describe('experience', () => {
  const ROUTES = ['', '/workout', '/exercises', '/exercises/barbell-squat', '/routines', '/history', '/analytics', '/body', '/chamber', '/quests', '/achievements', '/calendar', '/tools', '/community', '/profile'];

  test('every route renders without errors or horizontal overflow, empty and with data', async ({ page }) => {
    test.setTimeout(180_000);
    const problems = watchConsole(page);
    await enterApp(page);
    const check = async () => {
      for (const r of ROUTES) {
        await page.goto(`./#/app${r}`);
        await expect(page.locator('main h1').first()).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(100);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over, `horizontal overflow on ${r || '/'}`).toBeLessThanOrEqual(0);
      }
    };
    await check();
    await quickWorkout(page, 'Data', '100');
    await check();
    expect(problems).toEqual([]);
  });

  test('analytics tabs all render charts from real data', async ({ page }) => {
    const problems = watchConsole(page);
    await enterApp(page);
    await quickWorkout(page, 'Charted', '100');
    await page.goto('./#/app/analytics');
    await expect(page.getByTestId('chart')).toHaveCount(4);
    await expect(page.locator('.recharts-surface').first()).toBeVisible();
    await page.getByTestId('chart').first().getByRole('button', { name: /as a table/ }).click();
    await expect(page.getByTestId('chart').first().locator('table')).toBeVisible();
    await page.getByRole('tab', { name: 'Exercise' }).click();
    await expect(page.getByTestId('an-exercise')).toBeVisible();
    await page.getByRole('tab', { name: 'Muscles' }).click();
    await expect(page.getByTestId('muscle-avg')).toContainText('Chest');
    await page.getByRole('tab', { name: 'Reports' }).click();
    await expect(page.getByRole('heading', { name: 'Yearly' })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('landing: begin button enters the app; the demo logger works', async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto('./');
    await expect(page.getByRole('heading', { name: /Forge your strength/i })).toBeVisible();
    await page.getByTestId('demo-check').first().scrollIntoViewIfNeeded();
    await page.getByTestId('demo-check').first().click();
    await expect(page.getByTestId('demo-xp')).toHaveText('+6 XP');
    await page.getByTestId('armor-stage').first().click();
    await expect(page.getByText('Recruit Rig')).toBeVisible();
    await page.getByTestId('begin').click();
    await expect(page).toHaveURL(/#\/app$/);
    await expect(page.getByTestId('onboard-go')).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('reduced motion: no 3D is loaded, the drawn scene is shown, and the app still enters', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', baseURL: 'http://localhost:4173/Iron_Quest/' });
    const page = await ctx.newPage();
    const three: string[] = [];
    page.on('request', (r) => { if (/stage-.*\.js/.test(r.url())) three.push(r.url()); });
    await page.goto('./');
    await expect(page.getByTestId('fallback-world')).toBeVisible();
    await page.waitForTimeout(800);
    expect(three).toEqual([]);
    expect(await page.getByTestId('hero-canvas').count()).toBe(0);
    await page.getByTestId('begin').click();
    await expect(page).toHaveURL(/#\/app$/);
    await ctx.close();
  });

  test('WebGL unavailable falls back without errors', async ({ page }) => {
    await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = (() => null) as never; });
    const problems = watchConsole(page);
    await page.goto('./');
    await expect(page.getByTestId('fallback-world')).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('the tracker does not download 3D', async ({ page }) => {
    const heavy: string[] = [];
    page.on('request', (r) => { if (/stage-.*\.js/.test(r.url())) heavy.push(r.url()); });
    await page.addInitScript(() => localStorage.setItem('ironQuestDataV1', '{}'));
    await enterApp(page);
    await startBlank(page);
    await page.getByTestId('add-first').click();
    await addExercise(page, 'Leg Press');
    await page.getByTestId('exercise-card').waitFor();
    expect(heavy).toEqual([]);
  });

  test('offline: after one visit, the app opens and logs with no network', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium');
    await enterApp(page);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 20_000 });
    await page.waitForTimeout(2500); // lets the worker finish caching routes
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('kpi-workouts')).toBeVisible();
    await quickWorkout(page, 'No signal', '50');
    await page.goto('./#/app/history');
    await expect(page.getByTestId('history-row')).toContainText('No signal');
    await context.setOffline(false);
  });

  test('keyboard: skip link, focusable nav, and dialogs that trap focus and close on Escape', async ({ page }) => {
    await enterApp(page);
    await startBlank(page);
    await page.getByTestId('add-first').click();
    await expect(page.getByRole('dialog', { name: 'Add exercises' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Add exercises' })).toBeHidden();
  });
});

