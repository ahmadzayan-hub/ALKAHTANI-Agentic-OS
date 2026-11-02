import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Browser tooling is installed only in the disposable CI runner. No production
// API, provider, credentials, database or microphone is used by this check.
const require = createRequire(resolve(process.env.BROWSER_TOOL_ROOT, 'package.json'));
const { chromium } = require('playwright');
const origin = 'http://127.0.0.1:4173';
const output = resolve('artifacts/agent-os');
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/web', '--hostname', '127.0.0.1', '--port', '4173'], {
  stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error('Web server exited before readiness');
    try { ready = (await fetch(`${origin}/agent-os`)).ok; } catch {}
    if (ready) break;
    await new Promise(r => setTimeout(r, 500));
  }
  assert.ok(ready, 'production web server becomes ready');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  let requests = 0, responseStatus = 200;
  const synthetic = {
    observedAt: '2026-11-02T12:00:00Z', source: 'project-database',
    agents: [{ slug: 'synthetic', name: 'Synthetic identity', role: 'Test role', crew: 'Test crew', configured_status: 'live', runtime_state: 'unverified', last_finished_at: null }],
    tasks: { counts: { open: 2, doing: 1, done: 0, blocked: 0 }, total: 3 },
    memory: { counts: [{ type: 'synthetic-note', count: 1 }], hermesLinked: false },
    pendingApprovals: 1, hermes: { state: 'disabled', installedVersion: null, runningVersion: null },
  };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/v1/agent-os/overview') {
      requests++;
      assert.equal(route.request().headers().authorization, 'Bearer synthetic-browser-token');
      return route.fulfill({ status: responseStatus, contentType: 'application/json', body: JSON.stringify(responseStatus === 200 ? synthetic : { error: 'Synthetic unavailable response' }) });
    }
    return route.continue();
  });
  await page.goto(`${origin}/agent-os`);
  const load = page.getByRole('button', { name: /Load workspace/ });
  await load.waitFor();
  assert.equal(requests, 0, 'no automatic API request');
  assert.ok(await load.isDisabled());
  assert.ok(await page.getByRole('button', { name: 'Voice controls unavailable' }).isDisabled());
  assert.ok(await page.getByRole('button', { name: 'Reduced motion' }).isDisabled());
  const canvas = page.locator('.presence-canvas canvas');
  const pixels = () => canvas.evaluate(c => c.toDataURL());
  const shapes = [];
  for (const mode of ['presence', 'core', 'registry']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await page.waitForFunction(mode => document.querySelector(`.presence-modes button[aria-pressed="true"]`)?.textContent === mode, mode);
    await page.waitForTimeout(100);
    shapes.push(await pixels());
    await page.screenshot({ path: `${output}/desktop-${mode}.png`, fullPage: true });
  }
  assert.equal(new Set(shapes).size, 3, 'three distinct rendered canvas modes');
  const still = await pixels();
  await page.waitForTimeout(150);
  assert.equal(await pixels(), still, 'reduced-motion canvas remains still');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Pause motion' }).click();
  const paused = await pixels();
  await page.waitForTimeout(150);
  assert.equal(await pixels(), paused, 'paused canvas remains still');
  await page.getByLabel('Existing operator token').fill('synthetic-browser-token');
  await load.click();
  await page.getByRole('heading', { name: 'Synthetic identity' }).waitFor();
  assert.equal(requests, 1);
  assert.ok(await page.getByText('Runtime: unverified', { exact: true }).isVisible());
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  assert.equal(await page.getByLabel('Existing operator token').inputValue(), '');
  assert.ok(await load.isDisabled());
  assert.equal(await page.getByRole('heading', { name: 'Synthetic identity' }).count(), 0);
  responseStatus = 401;
  await page.getByLabel('Existing operator token').fill('synthetic-browser-token');
  await load.click();
  await page.getByText('Access denied. Use an existing operator token for this workspace.').waitFor();
  assert.equal(await page.getByLabel('Existing operator token').inputValue(), '');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.getByRole('navigation', { name: 'Mobile navigation' });
  await mobile.waitFor({ state: 'visible' });
  const more = mobile.locator('summary');
  await more.focus();
  await page.keyboard.press('Enter');
  assert.ok(await mobile.getByRole('link', { name: 'Reference Model', exact: true }).isVisible(), 'keyboard opens complete More menu');
  assert.ok(await mobile.getByRole('link', { name: 'Connections', exact: true }).isVisible());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal mobile overflow');
  await page.screenshot({ path: `${output}/mobile-menu.png`, fullPage: true });
  assert.deepEqual(pageErrors, [], 'no uncaught browser errors');
  console.log('PASS: production page, three canvas modes, reduced motion, pause, synthetic registry, 401/disconnect clearing, mobile keyboard More menu, no overflow; no live integrations.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
