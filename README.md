# playwright-console-reporter

A Playwright reporter that produces Cypress-style formatted console output — a run-start summary box, per-spec results with coloured pass/fail lines, a full failure breakdown (including captured browser console errors and network failures), and a final summary table with flaky/pending/skipped columns.

---

## Requirements

- Node.js >= 16
- `@playwright/test` >= 1.20.0

---

## Installation

From GitHub:

```bash
npm install github:didlika/playwright-console-report --save-dev
```

From npm (once published):

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
>
> **Note:** The fixture captures `page` events only. Tests using `{ request }` (Playwright's `APIRequestContext`) are not affected — assertion failures on status codes are reported in the error message, not as network issues.

If you do not need console/network capture, keep importing from `@playwright/test` directly — the reporter works either way.

---

## Test annotations

The reporter correctly handles all Playwright test annotations:

| Annotation | Outcome | Counted as | Line in output |
|---|---|---|---|
| `test('...')` — passes | expected | **Passed** | `✔ title (duration)` |
| `test.slow('...')` — passes | expected | **Passed** | `✔ title (duration) (slow)` |
| `test.fail('...')` — fails as expected | expected | **Passed** | `✔ title (duration) (expected failure)` |
| `test.fail('...')` — unexpectedly passes | unexpected | **Failed** | `✖ title (duration) (unexpected pass)` |
| `test.skip('...')` | skipped | **Skipped** | `- title (skipped)` |
| `test.fixme('...')` | skipped | **Pending** | `- title (fixme)` |
| flaky (passed on retry) | flaky | **Passed + Flaky** | `~ title (duration) (flaky)` |

Flaky tests are counted in both **Passed** and **Flaky** — they appear in the `Flaky` column of the summary table and in the `Flaky:` row of the per-spec results box.

---

## Retry handling

With `retries` configured, each test is counted once using its **final result** only — intermediate failed attempts are ignored:

- A test that fails on attempt 1 and passes on attempt 2 → counted as **Flaky**
- A test that fails all attempts → counted as **Failed** once (not multiplied by the retry count)
- A `test.fail()` that fails as expected → counted immediately as **Passed** (expected failures are never retried)

---

## Console output

### Run start

```
======================================================================

  (Run Starting)

  ┌──────────────────────────────────────────────────────────────────┐
  │ Reporter:    playwright-console-reporter                         │
  │ Browser:     chromium (headless), firefox (headless)            │
  │ Node Version: v20.11.0 (/usr/local/bin/node)                    │
  │ Specs:       2 found (login.spec.ts, checkout.spec.ts)          │
  │ Searched:    e2e                                                 │
  └──────────────────────────────────────────────────────────────────┘
```

The `Browser` line lists only the browsers that have tests actually running. If you run with `--project=chromium`, only `chromium (headless)` is shown regardless of other projects defined in `playwright.config.ts`.

### Per-spec results (printed after all tests in the file complete)

```
  ──────────────────────────────────────────────────────────────────────

  Running:  login.spec.ts (1 of 2)

    ✔ displays the login form (320ms)
    ✔ expected to fail (150ms) (expected failure)
    ✔ slow operation (3.2s) (slow)
    ~ flaky test (800ms) (flaky)
    - known broken (fixme)
    - not yet implemented (skipped)
    ✖ shows an error on bad credentials (1.2s)

  (Results)

  ┌──────────────────────────────────────────────────────────────────┐
  │ Tests:       7                                                   │
  │ Passing:     4                                                   │
  │ Failing:     1                                                   │
  │ Flaky:       1                                                   │
  │ Pending:     1                                                   │
  │ Skipped:     1                                                   │
  │ Screenshots: 0                                                   │
  │ Video:       false                                               │
  │ Duration:    4 seconds                                           │
  │ Spec Ran:    login.spec.ts                                       │
  └──────────────────────────────────────────────────────────────────┘
```

### Failures section

Printed immediately after `(Results)` for any spec with failures.

**Single-browser failure:**

```
  (Failures)

  1) chromium > login.spec.ts > Login > shows an error on bad credentials
     Expected locator to be visible ...

     at Login (e2e/login.spec.ts:14:5)

     (Network Issues)
       [404] GET https://api.example.com/session

     (Console Issues)
       [console.error] Uncaught TypeError: Cannot read properties of null
```

**Multi-browser failure — same error across all browsers:**

```
  (Failures)

  1) login.spec.ts > Login > shows an error on bad credentials
     Expected locator to be visible ...

     at Login (e2e/login.spec.ts:14:5)

     (Network Issues)
       [404] GET https://api.example.com/session
```

When the same test fails in multiple browsers with an identical error and identical attachments, the failure is printed **once**. If attachments differ per browser, only the browsers with unique data get a `[browser]` sub-section. If the errors themselves differ, each browser gets its own full block.

- `(Network Issues)` and `(Console Issues)` sections are **omitted entirely** when empty — no "None" placeholder.
- Stack frames show only user-code lines (no `node_modules` or Playwright internals), with **relative paths** from the working directory.

### Global errors

Errors thrown outside of any test (e.g. a broken `beforeAll`, a fixture setup crash) are printed immediately:

```
  (Global Error)

  Error: beforeAll hook failed: connection refused

  at setupDatabase (e2e/helpers.ts:12:3)
```

### Final summary table

```
======================================================================

  (Run Finished)

       Spec                 Duration Total Passed Failed Flaky Pending Skipped
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ ✖  login.spec.ts          00:04     7      4      1     1       1       1 │
  ├──────────────────────────────────────────────────────────────────────────┤
  │ ✔  checkout.spec.ts       00:06     5      5      0     0       0       0 │
  └──────────────────────────────────────────────────────────────────────────┘
    ✖  Some specs failed      00:10    12      9      1     1       1       1

  Status: FAILED
```

- Passing spec rows and the footer are **green** when all tests in that spec pass; failing rows are **red**.
- The filename column is fixed at **20 characters**. Names longer than 20 chars are truncated with an ellipsis (e.g. `integration-checkou…`) so the table always fits in an 80-column terminal.
- Screenshot and video paths are printed relative to the working directory.
- If a run is interrupted (`Ctrl+C`), any partially-completed spec is flushed before the summary table.

> **Note on Screenshots counter:** With `screenshot: 'only-on-failure'` set globally, the *Screenshots* count equals the *Failing* count — one screenshot per failure. The counter is most meaningful when screenshots are captured selectively (e.g. via `testInfo.attach()`).

---

## Color output

Colors are enabled by default. To disable:

```bash
NO_COLOR=1 npx playwright test

FORCE_COLOR=0 npx playwright test
```

---

## Project structure

```
playwright-console-reporter/
├── src/
│   ├── index.ts        # main reporter — implements Playwright's Reporter interface
│   └── fixtures.ts     # extended page fixture (console & network capture)
├── tests/
│   ├── helpers.ts          # shared types, factory functions, runReporter
│   ├── unit.test.ts        # internal helper tests
│   └── integration.test.ts # full lifecycle tests (colors, table width)
├── dist/               # compiled output (auto-generated, not committed)
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
