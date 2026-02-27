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
      expect(output).toContain(RED + '  1) Suite > broken test');
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

    it('prints (Console Issues) = None in green when no console errors', () => {
      const clean = runReporter([{ filePath: FILE, title: 'clean', status: 'failed' }]);
      expect(clean).toContain(GREEN + '     (Console Issues)');
      expect(clean).toContain(GREEN + '       None');
    });

    it('prints (Network Issues) = None in green when no network failures', () => {
      const clean = runReporter([{ filePath: FILE, title: 'clean', status: 'failed' }]);
      expect(clean).toContain(GREEN + '     (Network Issues)');
      expect(clean).toContain(GREEN + '       None');
    });
  });

  describe('dynamic table width based on filename length', () => {
    it('uses minimum width of 20 for short filenames', () => {
      const out = runReporter([{ filePath: '/tests/short.spec.ts', status: 'passed' }]);
      expect(out).toContain('─'.repeat(71));
    });

    it('expands table width to fit a longer filename', () => {
      const longFile = '/tests/a-very-long-spec-filename-here.spec.ts';
      const out = runReporter([{ filePath: longFile, status: 'passed' }]);
      expect(out).toContain('─'.repeat(89));
      expect(out).not.toContain('┌' + '─'.repeat(71) + '┐');
    });

    it('sets table width to the longest filename across multiple specs', () => {
      const out = runReporter([
        { filePath: '/tests/login.spec.ts', status: 'passed' },
        { filePath: '/tests/integration-checkout.spec.ts', status: 'passed' },
      ]);
      expect(out).toContain('─'.repeat(79));
    });
  });
});
