import { readFileSync } from 'node:fs';

interface Related {
  loadsDir: string;
  projects: Record<string, string[]>;
  apart: string[];
}

/**
 * The rule `npm run e2e:related` runs by: every project playwright.config.ts names is either one it
 * runs the specs of a kind with, or one said to be run apart, in e2e/related.json. A project added to
 * the configuration and to neither would have its specs left out of every related run unnoticed.
 */
describe('the projects the related e2e run goes through', () => {
  const related = JSON.parse(readFileSync('e2e/related.json', 'utf-8')) as Related;
  const config = readFileSync('playwright.config.ts', 'utf-8');
  const projects = config.slice(config.indexOf('  projects: ['), config.indexOf('  webServer: {'));
  const named = [...projects.matchAll(/^\s+name: '([^']+)',$/gm)].map((match) => match[1]);
  const run = Object.values(related.projects).flat();

  it('finds the projects the configuration names', () => {
    expect(named.length).toBeGreaterThan(5);
    expect(new Set(named).size).toBe(named.length);
  });

  it('runs, or sets apart, every project the configuration names, and names none it does not', () => {
    expect([...run, ...related.apart].sort()).toEqual([...named].sort());
  });

  it('runs no project it also sets apart', () => {
    expect(run.filter((project) => related.apart.includes(project))).toEqual([]);
  });

  it('has the helper that keeps what each test loads write where the picker reads', () => {
    const helper = readFileSync('e2e/helpers.ts', 'utf-8');
    const picker = readFileSync('scripts/e2e-related.mjs', 'utf-8');

    expect(helper).toContain("import related from './related.json';");
    expect(helper).toContain('const LOADS_DIR = related.loadsDir;');
    expect(picker).toContain("JSON.parse(readFileSync('e2e/related.json', 'utf-8'))");
    expect(`${helper}\n${picker}`).not.toContain('axe-e2e/loads');
    expect(helper).not.toMatch(/'axe-e2e'/);
  });
});
