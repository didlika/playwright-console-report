# playwright-console-reporter

A Playwright reporter that produces Cypress-style formatted console output — a run-start summary box, per-spec results with coloured pass/fail lines, a full failure breakdown (including captured browser console errors and network failures), and a final summary table.

---

## Requirements

- Node.js >= 16
- `@playwright/test` >= 1.20.0

---

## Installation

```bash
npm install playwright-console-reporter --save-dev
```

---

## Setup

### 1. Register the reporter

In your `playwright.config.ts`, replace (or add to) the `reporter` array:

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [['playwright-console-reporter']],
});
```

To run alongside Playwright's built-in HTML report:

```ts
reporter: [
  ['playwright-console-reporter'],
  ['html', { open: 'never' }],
],
```

### 2. Use the extended fixture (recommended)

The package ships a `fixtures` entry point that extends Playwright's built-in `page` fixture. It automatically captures browser **console errors/warnings** and **failed/4xx–5xx network requests**, and attaches them to any failing test. The reporter then surfaces these in the **(Failures)** section of the output.

Replace imports of `@playwright/test` in your spec files with:

```ts
// e2e/login.spec.ts
import { test, expect } from 'playwright-console-reporter/fixtures';

test.describe('Login', () => {
  test('displays the login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading')).toHaveText('Sign in');
  });

  test('shows an error on bad credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name=email]', 'bad@example.com');
    await page.fill('[name=password]', 'wrong');
    await page.click('[type=submit]');
    await expect(page.getByRole('alert')).toBeVisible();
  });
});
```

> **Note:** Console and network data is only attached when a test **fails**. Passing tests produce no extra output.

If you do not need console/network capture, keep importing from `@playwright/test` directly — the reporter works either way.

---

## Console output

### Run start

```
======================================================================

  (Run Starting)

  ┌──────────────────────────────────────────────────────────────────┐
  │ Reporter:    Playwright Jenkins Reporter                         │
  │ Browser:     chromium (headless)                                 │
  │ Node Version: v20.11.0 (/usr/local/bin/node)                    │
  │ Specs:       2 found (login.spec.ts, checkout.spec.ts)          │
  │ Searched:    e2e                                                 │
  └──────────────────────────────────────────────────────────────────┘
```

### Per-spec results (printed after all tests in the file complete)

```
  ──────────────────────────────────────────────────────────────────────

  Running:  login.spec.ts (1 of 2)

    ✔ displays the login form (320ms)
    ✖ shows an error on bad credentials (1.2s)

  (Results)

  ┌──────────────────────────────────────────────────────────────────┐
  │ Tests:       2                                                   │
  │ Passing:     1                                                   │
  │ Failing:     1                                                   │
  │ Pending:     0                                                   │
  │ Skipped:     0                                                   │
  │ Screenshots: 0                                                   │
  │ Video:       false                                               │
  │ Duration:    4 seconds                                           │
  │ Spec Ran:    login.spec.ts                                       │
  └──────────────────────────────────────────────────────────────────┘

  (Failures)

  1) Login > shows an error on bad credentials
     Expected locator to be visible ...

     at Object.<anonymous> (e2e/login.spec.ts:14:5)

     (Network Issues)
     [404] GET https://api.example.com/session

     (Console Issues)
     [console.error] Uncaught TypeError: Cannot read properties of null
```

### Final summary table

```
======================================================================

  (Run Finished)

       Spec                  Duration  Total Passed Failed Pending Skipped
  ┌────────────────────────────────────────────────────────────────────────┐
  │ ✔  login.spec.ts           00:04      2      1      1       0       0  │
  ├────────────────────────────────────────────────────────────────────────┤
  │ ✔  checkout.spec.ts        00:06      5      5      0       0       0  │
  └────────────────────────────────────────────────────────────────────────┘
    ✖  Some specs failed       00:10      7      6      1       0       0

  Status: FAILED
```

- Passing spec rows and the overall footer are **green** when all tests pass.
- Failing spec rows and the footer are **red** when any test fails.
- The table width adjusts automatically to fit the longest spec filename.

---

## Color output

Colors are enabled by default. To disable:

```bash
# Disable (standard convention)
NO_COLOR=1 npx playwright test

# Also disables
FORCE_COLOR=0 npx playwright test
```

---

## Project structure

```
playwright-console-reporter/
├── src/
│   ├── index.ts        # JenkinsReporter — implements Playwright's Reporter interface
│   └── fixtures.ts     # Extended page fixture (console & network capture)
├── tests/
│   ├── helpers.ts          # shared types, factory functions, runReporter
│   ├── unit.test.ts        # internal helper tests
│   └── integration.test.ts # full lifecycle tests (colors, table width)
├── dist/               # Compiled output (auto-generated, not committed)
├── package.json
└── tsconfig.json
```

---

## Development

```bash
npm install          # install dependencies
npm run build        # compile TypeScript → dist/
npm run build:watch  # watch mode
npm test             # run unit + integration tests
npm run clean        # delete dist/
npm publish          # runs clean → build → test, then publishes
```

---

## License

MIT
