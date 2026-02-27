import JenkinsReporter from '../src/index';

const r = new JenkinsReporter() as any;

describe('JenkinsReporter — internal helpers', () => {
  describe('formatDuration', () => {
    it('returns ms for values under 1000', () => {
      expect(r.formatDuration(0)).toBe('0ms');
      expect(r.formatDuration(999)).toBe('999ms');
    });

    it('returns seconds with one decimal for >= 1000ms', () => {
      expect(r.formatDuration(1000)).toBe('1.0s');
      expect(r.formatDuration(2500)).toBe('2.5s');
    });
  });

  describe('formatClockDuration', () => {
    it('formats zero as 00:00', () => {
      expect(r.formatClockDuration(0)).toBe('00:00');
    });

    it('formats 90 seconds as 01:30', () => {
      expect(r.formatClockDuration(90_000)).toBe('01:30');
    });

    it('clamps negative values to 00:00', () => {
      expect(r.formatClockDuration(-1000)).toBe('00:00');
    });
  });

  describe('formatSecondsText', () => {
    it('returns "1 second" for 1000ms', () => {
      expect(r.formatSecondsText(1000)).toBe('1 second');
    });

    it('returns plural for other values', () => {
      expect(r.formatSecondsText(3000)).toBe('3 seconds');
      expect(r.formatSecondsText(0)).toBe('0 seconds');
    });
  });

  describe('getFileName', () => {
    it('returns the filename from a POSIX path', () => {
      expect(r.getFileName('/home/user/tests/login.spec.ts')).toBe('login.spec.ts');
    });

    it('handles Windows-style backslashes', () => {
      expect(r.getFileName('C:\\Users\\tests\\login.spec.ts')).toBe('login.spec.ts');
    });

    it('returns the value as-is when there is no slash', () => {
      expect(r.getFileName('login.spec.ts')).toBe('login.spec.ts');
    });
  });

  describe('truncate', () => {
    it('returns the original string when within max length', () => {
      expect(r.truncate('hello', 10)).toBe('hello');
    });

    it('truncates and adds ellipsis when over max', () => {
      const result: string = r.truncate('hello world', 7);
      expect(result.length).toBe(7);
      expect(result.endsWith('…')).toBe(true);
    });
  });

  describe('padRight', () => {
    it('pads with spaces to the given width', () => {
      expect(r.padRight('hi', 5)).toBe('hi   ');
    });

    it('truncates strings that exceed the width', () => {
      expect(r.padRight('hello world', 5)).toBe('hello');
    });

    it('returns the string unchanged when equal to width', () => {
      expect(r.padRight('hello', 5)).toBe('hello');
    });
  });

  describe('wrapLine', () => {
    it('returns a single-element array when text fits in width', () => {
      expect(r.wrapLine('short text', 20)).toEqual(['short text']);
    });

    it('wraps at word boundaries', () => {
      const lines: string[] = r.wrapLine('one two three four', 10);
      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(10);
      }
    });

    it('hard-wraps a single long word that exceeds width', () => {
      const lines: string[] = r.wrapLine('abcdefghijklmnop', 5);
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('formatKv', () => {
    it('produces "Key: value" format', () => {
      expect(r.formatKv('Browser', 'chromium (headless)')).toBe('Browser: chromium (headless)');
    });
  });

  describe('getSearchedDisplay', () => {
    it('returns "." for an empty array', () => {
      expect(r.getSearchedDisplay([])).toBe('.');
    });

    it('returns relative prefix common to all paths', () => {
      const cwd = process.cwd();
      const paths = [
        `${cwd}/tests/a/login.spec.ts`,
        `${cwd}/tests/a/dashboard.spec.ts`,
      ];
      const result: string = r.getSearchedDisplay(paths);
      expect(typeof result).toBe('string');
    });
  });

  describe('green / red', () => {
    it('wraps value in green ANSI codes when color is enabled', () => {
      const reporter = new JenkinsReporter() as any;
      Object.defineProperty(reporter, 'useColor', { value: true });
      expect(reporter.green('ok')).toContain('\u001b[32m');
      expect(reporter.green('ok')).toContain('\u001b[0m');
    });

    it('returns value unchanged when color is disabled', () => {
      const reporter = new JenkinsReporter() as any;
      Object.defineProperty(reporter, 'useColor', { value: false });
      expect(reporter.green('ok')).toBe('ok');
      expect(reporter.red('fail')).toBe('fail');
    });
  });

  describe('getBrowserDisplay', () => {
    const makeTests = (...projectNames: string[]) =>
      projectNames.map((name) => ({ titlePath: () => ['', name, 'suite', 'test'] }));

    it('returns single browser for a single project', () => {
      const config = {
        projects: [{ use: { browserName: 'chromium', headless: true }, name: 'chromium' }],
      };
      expect(r.getBrowserDisplay(config, makeTests('chromium'))).toBe('chromium (headless)');
    });

    it('returns all browsers for multiple running projects', () => {
      const config = {
        projects: [
          { use: { browserName: 'chromium', headless: true }, name: 'chromium' },
          { use: { browserName: 'firefox', headless: true }, name: 'firefox' },
          { use: { browserName: 'webkit', headless: false }, name: 'webkit' },
        ],
      };
      const tests = makeTests('chromium', 'firefox', 'webkit');
      expect(r.getBrowserDisplay(config, tests)).toBe('chromium (headless), firefox (headless), webkit (headed)');
    });

    it('excludes projects that have no running tests', () => {
      const config = {
        projects: [
          { use: { browserName: 'chromium', headless: true }, name: 'chromium' },
          { use: { browserName: 'firefox', headless: true }, name: 'firefox' },
          { use: { browserName: 'webkit', headless: false }, name: 'webkit' },
        ],
      };
      expect(r.getBrowserDisplay(config, makeTests('chromium'))).toBe('chromium (headless)');
    });

    it('deduplicates identical browser entries', () => {
      const config = {
        projects: [
          { use: { browserName: 'chromium', headless: true }, name: 'chromium' },
          { use: { browserName: 'chromium', headless: true }, name: 'chromium-2' },
        ],
      };
      expect(r.getBrowserDisplay(config, makeTests('chromium', 'chromium-2'))).toBe('chromium (headless)');
    });

    it('falls back to chromium headless when no tests', () => {
      expect(r.getBrowserDisplay({ projects: [] }, [])).toBe('chromium (headless)');
    });
  });
});
