import { test as base, expect, type Page } from '@playwright/test';
import { type TestInfo } from '@playwright/test';

export const test = base.extend<{ page: Page }>({
  page: async ({ page }: { page: Page }, use: (page: Page) => Promise<void>, testInfo: TestInfo) => {
    const consoleMessages: string[] = [];
    const networkFailures: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleMessages.push(`[console.${msg.type()}] ${msg.text()}`);
      }
    });

    page.on('requestfailed', (request) => {
      networkFailures.push(
        `[failed] ${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'unknown'}`,
      );
    });

    page.on('response', (response) => {
      if (response.status() >= 400) {
        networkFailures.push(
          `[${response.status()}] ${response.request().method()} ${response.url()}`,
        );
      }
    });

    await use(page);

    if (testInfo.status !== testInfo.expectedStatus) {
      if (consoleMessages.length > 0) {
        await testInfo.attach('console-errors', {
          body: consoleMessages.join('\n'),
          contentType: 'text/plain',
        });
      }
      if (networkFailures.length > 0) {
        await testInfo.attach('network-failures', {
          body: networkFailures.join('\n'),
          contentType: 'text/plain',
        });
      }
    }
  },
});

export { expect };
