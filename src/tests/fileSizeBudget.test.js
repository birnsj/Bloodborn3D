/**
 * Size ratchet for oversized source files.
 *
 * These files grew because every feature landed in them. Rules enforced here:
 *  1. A source file over MAX_UNLISTED lines must have a budget below, so new giants cannot appear silently.
 *  2. A listed file must not exceed its budget. Move code into new modules instead of growing it.
 *  3. When a listed file shrinks by more than SLACK lines, lower its budget so the room is not reused.
 * The goal is for every entry to disappear (each file under MAX_UNLISTED).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_UNLISTED = 1500;
const SLACK = 100;

/** path (relative to src/) -> maximum allowed lines. Lower these as files are split. */
const BUDGETS = {
  'editor/Viewport.jsx': 2786,
  'editor/projectArt/ProjectArtLibraryPanel.jsx': 2429,
  'editor/layout/DetailsPanel.jsx': 1864,
  // Help text table: content, not logic, so it gets more room.
  'ui/hoverHelp/helpContent.js': 1600,
};

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'tests') continue;
      sourceFiles(full, out);
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const lineCount = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
const relPath = (file) => path.relative(SRC, file).replace(/\\/g, '/');

describe('file size budget', () => {
  const files = sourceFiles(SRC).map((f) => ({ rel: relPath(f), lines: lineCount(f) }));

  it(`no unlisted source file exceeds ${MAX_UNLISTED} lines`, () => {
    const offenders = files
      .filter((f) => f.lines > MAX_UNLISTED && !(f.rel in BUDGETS))
      .map((f) => `${f.rel} (${f.lines} lines)`);
    expect(offenders, 'split these into smaller modules').toEqual([]);
  });

  it('listed files stay within their budget', () => {
    const over = files
      .filter((f) => f.rel in BUDGETS && f.lines > BUDGETS[f.rel])
      .map((f) => `${f.rel}: ${f.lines} > budget ${BUDGETS[f.rel]} (extract code instead of growing it)`);
    expect(over).toEqual([]);
  });

  it('budgets are lowered when files shrink', () => {
    const loose = files
      .filter((f) => f.rel in BUDGETS && BUDGETS[f.rel] - f.lines > SLACK)
      .map((f) => `${f.rel}: ${f.lines} lines but budget is ${BUDGETS[f.rel]} (lower it)`);
    expect(loose).toEqual([]);
  });

  it('every budget entry points at a real file', () => {
    const known = new Set(files.map((f) => f.rel));
    expect(Object.keys(BUDGETS).filter((k) => !known.has(k))).toEqual([]);
  });
});
