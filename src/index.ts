import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError,
  TestResult,
} from '@playwright/test/reporter';
import * as path from 'path';

type FailedTest = {
  filePath: string;
  titlePath: string[];
  error?: TestError;
  unexpectedPass?: boolean;
  consoleErrors?: string;
  networkFailures?: string;
};

type SpecStats = {
  filePath: string;
  fileName: string;
  total: number;
  completed: number;
  passing: number;
  failing: number;
  flaky: number;
  pending: number;
  skipped: number;
  startedAt: number;
  endedAt: number;
  videoPaths: Set<string>;
  screenshotPaths: Set<string>;
  testLines: string[];
};

class JenkinsReporter implements Reporter {
  private readonly useColor =
    process.env.NO_COLOR === undefined && process.env.FORCE_COLOR !== '0';
  private totalTests = 0;
  private passed = 0;
  private failed = 0;
  private pending = 0;
  private skipped = 0;
  private flaky = 0;
  private startTime = 0;
  private failureDetails: FailedTest[] = [];

  private specOrder: string[] = [];
  private specStats = new Map<string, SpecStats>();
  private displayedSpecStart = new Set<string>();

  private browserDisplay = 'chromium (headless)';
  private searchedDisplay = '.';
  private tableFilenameWidth = 20;
  private tableRowWidth = 71;

  onBegin(config: FullConfig, suite: Suite): void {
    this.startTime = Date.now();
    const allTests = suite.allTests();
    this.totalTests = allTests.length;

    this.browserDisplay = this.getBrowserDisplay(config, allTests);
    this.searchedDisplay = this.getSearchedDisplay(
      allTests.map((testCase) => testCase.location.file),
    );

    const specCounts = new Map<string, number>();
    for (const testCase of allTests) {
      const filePath = testCase.location.file;
      specCounts.set(filePath, (specCounts.get(filePath) || 0) + 1);
      if (!this.specOrder.includes(filePath)) {
        this.specOrder.push(filePath);
      }
    }

    for (const filePath of this.specOrder) {
      this.specStats.set(filePath, {
        filePath,
        fileName: this.getFileName(filePath),
        total: specCounts.get(filePath) || 0,
        completed: 0,
        passing: 0,
        failing: 0,
        flaky: 0,
        pending: 0,
        skipped: 0,
        startedAt: 0,
        endedAt: 0,
        videoPaths: new Set<string>(),
        screenshotPaths: new Set<string>(),
        testLines: [],
      });
    }

    const longestFileName = Math.max(
      ...this.specOrder.map((fp) => this.getFileName(fp).length),
      20,
    );
    this.tableFilenameWidth = longestFileName;
    this.tableRowWidth = this.tableFilenameWidth + 51;

    this.write(`${'='.repeat(this.lineWidth())}\n\n`);
    this.write('  (Run Starting)\n\n');

    this.writeBox([
      this.formatKv('Reporter', 'Playwright Jenkins Reporter'),
      this.formatKv('Browser', this.browserDisplay),
      this.formatKv('Node Version', `${process.version} (${process.execPath})`),
      this.formatKv(
        'Specs',
        `${this.specOrder.length} found (${this.specOrder
          .map((filePath) => this.getFileName(filePath))
          .join(', ')})`,
      ),
      this.formatKv('Searched', this.searchedDisplay || '.'),
    ]);

    this.write('\n');
  }

  onTestBegin(test: TestCase): void {
    const filePath = test.location.file;
    const spec = this.specStats.get(filePath);
    if (!spec || this.displayedSpecStart.has(filePath)) {
      return;
    }

    this.displayedSpecStart.add(filePath);
    if (!spec.startedAt) {
      spec.startedAt = Date.now();
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const filePath = test.location.file;
    const spec = this.specStats.get(filePath);
    if (!spec) {
      return;
    }

    const outcome = test.outcome();
    const isUnexpectedPass = result.status === 'passed' && outcome === 'unexpected';
    const isFinalAttempt =
      result.retry === (test.retries ?? 0) ||
      outcome === 'expected' ||
      (result.status !== 'failed' &&
        result.status !== 'timedOut' &&
        !isUnexpectedPass);
    if (!isFinalAttempt) {
      return;
    }

    spec.completed += 1;

    const isFixme = test.annotations.some((a) => a.type === 'fixme');

    if (outcome === 'expected') {
      this.passed += 1;
      spec.passing += 1;
    } else if (outcome === 'flaky') {
      this.flaky += 1;
      this.passed += 1;
      spec.flaky += 1;
      spec.passing += 1;
    } else if (result.status === 'skipped') {
      if (isFixme) {
        this.pending += 1;
        spec.pending += 1;
      } else {
        this.skipped += 1;
        spec.skipped += 1;
      }
    } else {
      this.failed += 1;
      spec.failing += 1;

      const consoleErrors = result.attachments.find(
        (a) => a.name === 'console-errors',
      );
      const networkFailures = result.attachments.find(
        (a) => a.name === 'network-failures',
      );

      this.failureDetails.push({
        filePath,
        titlePath: test.titlePath(),
        error: result.error,
        unexpectedPass: result.status === 'passed',
        consoleErrors: consoleErrors?.body?.toString('utf-8'),
        networkFailures: networkFailures?.body?.toString('utf-8'),
      });
    }

    const duration = this.formatDuration(result.duration);
    if (outcome === 'expected') {
      if (result.status === 'failed') {
        spec.testLines.push(this.green(`    ✔ ${test.title} (${duration}) (expected failure)`));
      } else {
        spec.testLines.push(this.green(`    ✔ ${test.title} (${duration})`));
      }
    } else if (outcome === 'flaky') {
      spec.testLines.push(
        this.green(`    ~ ${test.title} (${duration}) (flaky)`),
      );
    } else if (result.status === 'skipped') {
      const label = isFixme ? 'fixme' : 'skipped';
      spec.testLines.push(`    - ${test.title} (${label})`);
    } else {
      spec.testLines.push(this.red(`    ✖ ${test.title} (${duration})${result.status === 'passed' ? ' (unexpected pass)' : ''}`));
    }

    for (const attachment of result.attachments) {
      if (
        attachment.path &&
        (attachment.name === 'video' ||
          attachment.contentType?.startsWith('video/'))
      ) {
        spec.videoPaths.add(attachment.path);
      }

      if (
        attachment.path &&
        (attachment.name === 'screenshot' ||
          attachment.contentType?.startsWith('image/'))
      ) {
        spec.screenshotPaths.add(attachment.path);
      }
    }

    if (spec.completed === spec.total) {
      spec.endedAt = Date.now();
      this.printSpecResults(spec);
    }
  }

  onEnd(result: FullResult): void {
    for (const filePath of this.specOrder) {
      const spec = this.specStats.get(filePath);
      if (spec && spec.completed > 0 && !spec.endedAt) {
        spec.endedAt = Date.now();
        this.printSpecResults(spec);
      }
    }

    this.write(`${'='.repeat(this.lineWidth())}\n\n`);
    this.write('  (Run Finished)\n\n');

    const tableHeader =
      `       Spec${' '.repeat(this.tableFilenameWidth - 3)} ` +
      `${'Duration'.padStart(8)} ` +
      `${'Total'.padStart(5)} ` +
      `${'Passed'.padStart(6)} ` +
      `${'Failed'.padStart(6)} ` +
      `${'Pending'.padStart(7)} ` +
      `${'Skipped'.padStart(7)}`;
    this.write(`${tableHeader}\n`);
    this.write(`  ┌${'─'.repeat(this.tableRowWidth)}┐\n`);

    for (let index = 0; index < this.specOrder.length; index += 1) {
      const spec = this.specStats.get(this.specOrder[index]);
      if (!spec) {
        continue;
      }

      const icon = spec.failing > 0 ? '✖' : '✔';
      const duration = this.formatClockDuration(spec.endedAt - spec.startedAt);
      const row = ` ${icon}  ${this.truncate(spec.fileName, this.tableFilenameWidth).padEnd(
        this.tableFilenameWidth,
      )} ${duration.padStart(8)} ${String(spec.total).padStart(5)} ${String(
        spec.passing,
      ).padStart(6)} ${String(spec.failing).padStart(6)} ${String(
        spec.pending,
      ).padStart(7)} ${String(spec.skipped).padStart(7)} `;
      const rowPadded = row.padEnd(this.tableRowWidth);
      const coloredRow = spec.failing > 0 ? this.red(rowPadded) : this.green(rowPadded);

      this.write(`  │${coloredRow}│\n`);

      if (index < this.specOrder.length - 1) {
        this.write(`  ├${'─'.repeat(this.tableRowWidth)}┤\n`);
      }
    }

    this.write(`  └${'─'.repeat(this.tableRowWidth)}┘\n`);

    const totalDuration = this.formatClockDuration(Date.now() - this.startTime);
    const allPassed = this.failed === 0;
    const footerIcon = allPassed ? '✔' : '✖';
    const footerLabel = allPassed ? 'All specs passed!' : 'Some specs failed';
    const footer = `  ${footerIcon}  ${footerLabel.padEnd(
      this.tableFilenameWidth,
    )} ${totalDuration.padStart(8)} ${String(this.totalTests).padStart(
      5,
    )} ${String(this.passed).padStart(6)} ${String(this.failed).padStart(
      6,
    )} ${String(this.pending).padStart(7)} ${String(this.skipped).padStart(
      7,
    )} `;
    const footerPadded = footer.padEnd(this.tableRowWidth);
    this.write(`  ${allPassed ? this.green(footerPadded) : this.red(footerPadded)}\n`);

    this.write(`\n  Status: ${result.status.toUpperCase()}\n\n`);
  }

  private printSpecResults(spec: SpecStats): void {
    const duration = this.formatSecondsText(spec.endedAt - spec.startedAt);
    const hasVideo = spec.videoPaths.size > 0;
    const passed = spec.failing === 0;
    const color = (text: string) =>
      passed ? this.green(text) : this.red(text);

    const specIndex = this.specOrder.indexOf(spec.filePath) + 1;
    this.writeSeparator();
    this.write(
      `\n  Running:  ${spec.fileName} (${specIndex} of ${this.specOrder.length})\n\n`,
    );

    for (const line of spec.testLines) {
      this.write(`${line}\n`);
    }

    this.write('\n  (Results)\n\n');
    this.writeBox(
      [
        this.formatKv('Tests', String(spec.total)),
        this.formatKv('Passing', String(spec.passing)),
        this.formatKv('Failing', String(spec.failing)),
        this.formatKv('Flaky', String(spec.flaky)),
        this.formatKv('Pending', String(spec.pending)),
        this.formatKv('Skipped', String(spec.skipped)),
        this.formatKv('Screenshots', String(spec.screenshotPaths.size)),
        this.formatKv('Video', String(hasVideo)),
        this.formatKv('Duration', duration),
        this.formatKv('Spec Ran', spec.fileName),
      ],
      color,
    );

    const specFailures = this.failureDetails.filter(
      (failure) => failure.filePath === spec.filePath,
    );

    if (specFailures.length > 0) {
      this.write('\n  (Failures)\n\n');

      type FailureGroup = { key: string; entries: typeof specFailures };
      const groups: FailureGroup[] = [];
      for (const failure of specFailures) {
        const key = failure.titlePath.slice(2).join(' > ');
        const existing = groups.find((g) => g.key === key);
        if (existing) {
          existing.entries.push(failure);
        } else {
          groups.push({ key, entries: [failure] });
        }
      }

      const allSameError = (entries: typeof specFailures): boolean =>
        entries.length > 1 &&
        entries[0].error?.message !== undefined &&
        entries.every((e) => e.error?.message === entries[0].error!.message);

      const printEntry = (failure: (typeof specFailures)[0], skipError = false) => {
        if (!skipError) {
          if (failure.error?.message) {
            for (const line of failure.error.message.split('\n')) {
              this.write(this.red(`     ${line}\n`));
            }
          } else if (failure.unexpectedPass) {
            this.write(this.red(`     Test was expected to fail but passed\n`));
          } else {
            this.write(this.red(`     No error message available\n`));
          }

          if (failure.error?.stack) {
            this.write('\n');
            for (const line of failure.error.stack.split('\n').filter((l) => l.trimStart().startsWith('at '))) {
              this.write(`     ${line}\n`);
            }
          }
        }

        if (failure.networkFailures) {
          this.write('\n');
          this.write(this.red(`     (Network Issues)\n`));
          for (const line of failure.networkFailures.split('\n')) {
            this.write(this.red(`       ${line}\n`));
          }
        }

        if (failure.consoleErrors) {
          this.write('\n');
          this.write(this.red(`     (Console Issues)\n`));
          for (const line of failure.consoleErrors.split('\n')) {
            this.write(this.red(`       ${line}\n`));
          }
        }

        this.write('\n');
      };

      groups.forEach(({ key, entries }, idx) => {
        if (entries.length === 1) {
          const fullTitle = entries[0].titlePath.slice(1).join(' > ');
          this.write(this.red(`  ${idx + 1}) ${fullTitle}\n`));
          printEntry(entries[0]);
        } else if (allSameError(entries)) {
          this.write(this.red(`  ${idx + 1}) ${key}\n`));
          printEntry(entries[0]);
          const withExtras = entries.filter((e) => e.networkFailures || e.consoleErrors);
          for (const entry of withExtras) {
            this.write(this.red(`     [${entry.titlePath[1]}]\n`));
            printEntry(entry, true);
          }
        } else {
          this.write(this.red(`  ${idx + 1}) ${key}\n`));
          for (const entry of entries) {
            const browser = entry.titlePath[1];
            this.write(this.red(`\n     [${browser}]\n`));
            printEntry(entry);
          }
        }
      });
    }

    if (spec.screenshotPaths.size > 0) {
      this.write('\n  (Screenshots)\n\n');
      for (const p of spec.screenshotPaths) {
        this.write(`  -  Screenshot: ${path.relative(process.cwd(), p)}\n`);
      }
    }

    if (hasVideo) {
      this.write('\n  (Video)\n\n');
      for (const p of spec.videoPaths) {
        this.write(`  -  Video output: ${path.relative(process.cwd(), p)}\n`);
      }
    }

    this.write('\n');
  }

  private lineWidth(): number {
    const columns = process.stdout.columns || 110;
    return Math.max(60, Math.min(96, columns - 10));
  }

  private rowWidth(): number {
    return this.lineWidth() - 4;
  }

  private writeSeparator(): void {
    this.write(`  ${'─'.repeat(this.lineWidth())}\n`);
  }

  private writeBox(lines: string[], colorFn?: (text: string) => string): void {
    const top = `  ┌${'─'.repeat(this.rowWidth())}┐\n`;
    const bottom = `  └${'─'.repeat(this.rowWidth())}┘\n`;
    this.write(colorFn ? colorFn(top) : top);
    for (const line of lines) {
      for (const wrapped of this.wrapLine(line, this.rowWidth() - 2)) {
        const row = `  │ ${this.padRight(wrapped, this.rowWidth() - 2)} │\n`;
        this.write(colorFn ? colorFn(row) : row);
      }
    }
    this.write(colorFn ? colorFn(bottom) : bottom);
  }

  private wrapLine(text: string, width: number): string[] {
    if (text.length <= width) {
      return [text];
    }

    const words = text.split(' ');
    const result: string[] = [];
    let current = '';

    for (const word of words) {
      if (word.length > width) {
        if (current) {
          result.push(current);
          current = '';
        }
        for (let index = 0; index < word.length; index += width) {
          result.push(word.slice(index, index + width));
        }
        continue;
      }

      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= width) {
        current = candidate;
      } else {
        if (current) {
          result.push(current);
        }
        current = word;
      }
    }

    if (current) {
      result.push(current);
    }

    return result;
  }

  private padRight(value: string, width: number): string {
    if (value.length >= width) {
      return value.slice(0, width);
    }

    return value + ' '.repeat(width - value.length);
  }

  private truncate(value: string, max: number): string {
    if (value.length <= max) {
      return value;
    }

    return `${value.slice(0, Math.max(0, max - 1))}…`;
  }

  private formatKv(label: string, value: string): string {
    return `${label}: ${value}`;
  }

  private formatDuration(durationMs: number): string {
    return durationMs < 1000
      ? `${durationMs}ms`
      : `${(durationMs / 1000).toFixed(1)}s`;
  }

  private formatClockDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  private formatSecondsText(durationMs: number): string {
    const seconds = Math.max(0, Math.round(durationMs / 1000));
    return seconds === 1 ? '1 second' : `${seconds} seconds`;
  }

  private getBrowserDisplay(config: FullConfig, allTests: TestCase[]): string {
    const runningProjects = new Set(allTests.map((t) => t.titlePath()[1]));
    const seen = new Set<string>();
    const entries: string[] = [];

    for (const project of config.projects) {
      if (!runningProjects.has(project.name)) {
        continue;
      }
      const browserName = project.use?.browserName || project.name || 'chromium';
      const headlessValue = project.use?.headless;
      const isHeadless = typeof headlessValue === 'boolean' ? headlessValue : true;
      const entry = `${browserName} (${isHeadless ? 'headless' : 'headed'})`;
      if (!seen.has(entry)) {
        seen.add(entry);
        entries.push(entry);
      }
    }

    return entries.length > 0 ? entries.join(', ') : 'chromium (headless)';
  }

  private getFileName(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.substring(normalized.lastIndexOf('/') + 1);
  }

  private getSearchedDisplay(filePaths: string[]): string {
    if (filePaths.length === 0) {
      return '.';
    }

    const normalized = filePaths.map((filePath) =>
      filePath.replace(/\\/g, '/'),
    );
    let prefix = normalized[0];

    for (let index = 1; index < normalized.length; index += 1) {
      while (!normalized[index].startsWith(prefix) && prefix.length > 0) {
        prefix = prefix.slice(0, -1);
      }
    }

    const slashIndex = prefix.lastIndexOf('/');
    if (slashIndex <= 0) {
      return '.';
    }

    const absolutePrefix = path.resolve(prefix.slice(0, slashIndex));
    const relativePrefix = path.relative(process.cwd(), absolutePrefix);

    if (!relativePrefix || relativePrefix === '.') {
      return '.';
    }

    return relativePrefix.replace(/\\/g, '/');
  }

  private write(message: string): void {
    process.stdout.write(message);
  }

  private green(value: string): string {
    if (!this.useColor) {
      return value;
    }

    return `\u001b[32m${value}\u001b[0m`;
  }

  private red(value: string): string {
    if (!this.useColor) {
      return value;
    }

    return `\u001b[31m${value}\u001b[0m`;
  }
}

export default JenkinsReporter;
