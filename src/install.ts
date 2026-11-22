// Helpers for `agent-browser-ff setup`.
import path from 'node:path';

export const SKILL_SOURCE = 'CatastrophistUser/agent-browser-ff';
export const SKILL_NAME = 'agent-browser-ff';
/** The `skills` installer needs this Node version or newer. */
export const SKILLS_MIN_NODE = [22, 20] as const;

/** Arguments passed to `npx` to install the agent skill globally. */
export function skillInstallArgs(): string[] {
  return ['skills', 'add', SKILL_SOURCE, '--skill', SKILL_NAME, '-g'];
}

/** True when a Node version string like "v22.20.1" satisfies the skills installer minimum. */
export function nodeSupportsSkills(version: string): boolean {
  const m = /^v?(\d+)\.(\d+)/.exec(version);
  if (!m) return false;
  const [major, minor] = [Number(m[1]), Number(m[2])];
  const [reqMajor, reqMinor] = SKILLS_MIN_NODE;
  return major > reqMajor || (major === reqMajor && minor >= reqMinor);
}

/** Interpret a yes/no answer. Empty input uses the default. Anything unclear is "no". */
export function parseYesNo(answer: string, defaultYes = true): boolean {
  const a = answer.trim().toLowerCase();
  if (a === '') return defaultYes;
  return a === 'y' || a === 'yes';
}

/** True when `dir` is one of the entries in a PATH string. */
export function dirOnPath(dir: string, pathVar: string, platform: NodeJS.Platform = process.platform): boolean {
  const sep = platform === 'win32' ? ';' : ':';
  const norm = (p: string) => (platform === 'win32' ? p.toLowerCase() : p).replace(/[\\/]+$/, '');
  return pathVar.split(sep).filter(Boolean).some((p) => norm(p) === norm(dir));
}

/** Global npm bin directory for a given `npm prefix -g` value. */
export function globalBinDir(prefix: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? prefix : path.join(prefix, 'bin');
}

export type StepResult = { name: string; status: 'ok' | 'skipped' | 'failed'; note?: string };

/** One line per step for the final summary. */
export function formatSummary(steps: StepResult[]): string {
  const mark = { ok: '✓', skipped: '-', failed: '✗' } as const;
  return steps.map((s) => `${mark[s.status]} ${s.name}${s.note ? ` (${s.note})` : ''}`).join('\n');
}
