import { GREEN, RED, RESET, runReporter } from './helpers';

describe('JenkinsReporter — integration', () => {
  const FILE = '/project/tests/login.spec.ts';

  describe('green color when all tests pass', () => {
    let output: string;

    beforeAll(() => {
      output = runReporter([
        { filePath: FILE, title: 'logs in', status: 'passed' },
        { filePath: FILE, title: 'logs out', status: 'passed' },
      ]);
    });

    it('wraps the passing table row in green', () => {
      expect(output).toContain(GREEN);
      const greenSegments = output.split(GREEN);
      const hasPassIcon = greenSegments.some((s) => s.includes('✔'));
      expect(hasPassIcon).toBe(true);
    });

    it('wraps the footer in green when all specs passed', () => {
      const idx = output.indexOf('All specs passed!');
      expect(idx).toBeGreaterThan(-1);
      const before = output.slice(0, idx);
      expect(before.lastIndexOf(GREEN)).toBeGreaterThan(before.lastIndexOf(RESET));
    });

    it('does not contain any red output', () => {
      expect(output).not.toContain(RED);
    });

    it('emits status PASSED', () => {
      expect(output).toContain('Status: PASSED');
    });

    it('wraps passing test lines in green', () => {
      expect(output).toContain(GREEN + '    ✔ logs in');
      expect(output).toContain(GREEN + '    ✔ logs out');
    });
  });

  describe('red color for failing tests', () => {
    let output: string;

    beforeAll(() => {
      output = runReporter([
        { filePath: FILE, title: 'should work', status: 'failed' },
      ]);
    });

    it('wraps the failing table row in red', () => {
      expect(output).toContain(RED);
      const redSegments = output.split(RED);
      const hasFailIcon = redSegments.some((s) => s.includes('✖'));
      expect(hasFailIcon).toBe(true);
    });

    it('wraps the footer in red when specs failed', () => {
      const idx = output.indexOf('Some specs failed');
      expect(idx).toBeGreaterThan(-1);
      const before = output.slice(0, idx);
      expect(before.lastIndexOf(RED)).toBeGreaterThan(before.lastIndexOf(RESET));
    });

    it('emits status FAILED', () => {
      expect(output).toContain('Status: FAILED');
    });

    it('wraps the failing test line in red', () => {
      expect(output).toContain(RED + '    ✖ should work');
    });
  });

  describe('red color for failing output details', () => {
    let output: string;

    beforeAll(() => {
      output = runReporter([
        {
          filePath: FILE,
          title: 'broken test',
          status: 'failed',
          consoleErrors: '[console.error] Uncaught TypeError: foo is not a function',
          networkFailures: '[404] GET https://api.example.com/data',
        },
      ]);
    });

    it('prints the failure title in red', () => {
      expect(output).toContain(RED + '  1) chromium > /project/tests/login.spec.ts > Suite > broken test');
    });

    it('prints the error message in red', () => {
      expect(output).toContain(RED + '     Expected true to be false');
    });

    it('prints the (Console Issues) header in red', () => {
      expect(output).toContain(RED + '     (Console Issues)');
    });

    it('prints each console error line in red', () => {
      expect(output).toContain(RED + '       [console.error] Uncaught TypeError: foo is not a function');
    });

    it('prints the (Network Issues) header in red', () => {
      expect(output).toContain(RED + '     (Network Issues)');
    });

    it('prints each network failure line in red', () => {
      expect(output).toContain(RED + '       [404] GET https://api.example.com/data');
    });

    it('omits (Console Issues) section when no console errors', () => {
      const clean = runReporter([{ filePath: FILE, title: 'clean', status: 'failed' }]);
      expect(clean).not.toContain('(Console Issues)');
    });

    it('omits (Network Issues) section when no network failures', () => {
      const clean = runReporter([{ filePath: FILE, title: 'clean', status: 'failed' }]);
      expect(clean).not.toContain('(Network Issues)');
    });
  });

  describe('dynamic table width based on filename length', () => {
    it('uses minimum width of 20 for short filenames', () => {
      const out = runReporter([{ filePath: '/tests/short.spec.ts', status: 'passed' }]);
      expect(out).toContain('─'.repeat(76));
    });

    it('truncates long filenames to fixed width of 20', () => {
      const longFile = '/tests/a-very-long-spec-filename-here.spec.ts';
      const out = runReporter([{ filePath: longFile, status: 'passed' }]);
      expect(out).toContain('─'.repeat(76));
      expect(out).toContain('a-very-long-spec-fi…');
    });

    it('keeps fixed width even across multiple specs with long filenames', () => {
      const out = runReporter([
        { filePath: '/tests/login.spec.ts', status: 'passed' },
        { filePath: '/tests/integration-checkout.spec.ts', status: 'passed' },
      ]);
      expect(out).toContain('─'.repeat(76));
      expect(out).toContain('integration-checkou…');
    });
  });

  describe('test.fail() — expected failure', () => {
    let output: string;

    beforeAll(() => {
      output = runReporter([
        { filePath: FILE, title: 'expected to fail', status: 'failed', outcome: 'expected' },
      ]);
    });

    it('shows a green tick with (expected failure) label', () => {
      expect(output).toContain(GREEN + '    ✔ expected to fail');
      expect(output).toContain('(expected failure)');
    });

    it('counts as passed, not failed', () => {
      expect(output).toContain('Passing: 1');
      expect(output).toContain('Failing: 0');
    });

    it('does not appear in (Failures) section', () => {
      expect(output).not.toContain('(Failures)');
    });

    it('does not emit any red output', () => {
      expect(output).not.toContain(RED);
    });
  });

  describe('test.fail() — unexpected pass', () => {
    let output: string;

    beforeAll(() => {
      output = runReporter([
        { filePath: FILE, title: 'should fail but passed', status: 'passed', outcome: 'unexpected' },
      ]);
    });

    it('shows a red cross with (unexpected pass) label', () => {
      expect(output).toContain(RED + '    ✖ should fail but passed (500ms) (unexpected pass)');
    });

    it('counts as failed', () => {
      expect(output).toContain('Failing: 1');
    });

    it('appears in (Failures) section', () => {
      expect(output).toContain('(Failures)');
    });
  });

  describe('test.skip() vs test.fixme()', () => {
    it('test.skip() increments skipped, not pending', () => {
      const out = runReporter([{ filePath: FILE, title: 'skipped test', status: 'skipped' }]);
      expect(out).toContain('    - skipped test (skipped)');
      expect(out).toContain('Skipped: 1');
      expect(out).toContain('Pending: 0');
    });

    it('test.fixme() increments pending, not skipped', () => {
      const out = runReporter([
        { filePath: FILE, title: 'fixme test', status: 'skipped', annotations: [{ type: 'fixme' }] },
      ]);
      expect(out).toContain('    - fixme test (fixme)');
      expect(out).toContain('Pending: 1');
      expect(out).toContain('Skipped: 0');
    });
  });
});
