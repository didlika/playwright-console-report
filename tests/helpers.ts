import JenkinsReporter from '../src/index';

export type SpecInput = {
  filePath: string;
  title?: string;
  status?: 'passed' | 'failed' | 'skipped';
  outcome?: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  annotations?: { type: string }[];
  consoleErrors?: string;
  networkFailures?: string;
};

export const GREEN = '\u001b[32m';
export const RED   = '\u001b[31m';
export const RESET = '\u001b[0m';

export function makeConfig(): any {
  return {
    workers: 1,
    projects: [{ use: { browserName: 'chromium', headless: true }, name: 'chromium' }],
  };
}

export function makeSuite(specs: SpecInput[]): any {
  return {
    allTests: () =>
      specs.map((spec) => ({
        location: { file: spec.filePath },
        title: spec.title ?? 'test',
        titlePath: () => ['', 'chromium', spec.filePath, spec.title ?? 'test'],
        outcome: () => 'expected',
        annotations: spec.annotations ?? [],
      })),
  };
}

export function makeTest(filePath: string, title: string, status: 'passed' | 'failed' | 'skipped', opts: { outcome?: string; annotations?: { type: string }[] } = {}): any {
  return {
    location: { file: filePath },
    title,
    retries: 0,
    titlePath: () => ['', 'chromium', filePath, 'Suite', title],
    outcome: () => opts.outcome ?? (status === 'passed' ? 'expected' : status === 'skipped' ? 'skipped' : 'unexpected'),
    annotations: opts.annotations ?? [],
  };
}

export function makeResult(
  status: 'passed' | 'failed' | 'skipped',
  opts: { consoleErrors?: string; networkFailures?: string } = {},
): any {
  const attachments: any[] = [];
  if (opts.consoleErrors) {
    attachments.push({ name: 'console-errors', body: Buffer.from(opts.consoleErrors), contentType: 'text/plain' });
  }
  if (opts.networkFailures) {
    attachments.push({ name: 'network-failures', body: Buffer.from(opts.networkFailures), contentType: 'text/plain' });
  }
  return {
    status,
    duration: 500,
    retry: 0,
    attachments,
    error: status === 'failed' ? { message: 'Expected true to be false', stack: '    at Object.<anonymous> (test.spec.ts:10:5)' } : undefined,
    errors: status === 'failed' ? [{ message: 'Expected true to be false' }] : [],
    steps: [],
  };
}

export function runReporter(specs: SpecInput[]): string {
  const output: string[] = [];
  const reporter = new JenkinsReporter() as any;
  reporter.write = (msg: string) => output.push(msg);
  Object.defineProperty(reporter, 'useColor', { value: true, configurable: true });

  reporter.onBegin(makeConfig(), makeSuite(specs));

  for (const spec of specs) {
    const title = spec.title ?? 'my test';
    const status = spec.status ?? 'passed';
    const test = makeTest(spec.filePath, title, status, {
      outcome: spec.outcome,
      annotations: spec.annotations,
    });
    const result = makeResult(status, {
      consoleErrors: spec.consoleErrors,
      networkFailures: spec.networkFailures,
    });
    reporter.onTestBegin(test);
    reporter.onTestEnd(test, result);
  }

  const anyFailed = specs.some((s) => {
    const status = s.status ?? 'passed';
    const outcome = s.outcome;
    if (status === 'failed' && outcome === 'expected') return false;
    if (status === 'passed' && outcome === 'unexpected') return true;
    return status === 'failed';
  });
  reporter.onEnd({ status: anyFailed ? 'failed' : 'passed' });

  return output.join('');
}
