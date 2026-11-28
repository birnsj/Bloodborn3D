import { describe, expect, it } from 'vitest';
import {
  ENCYCLOPEDIA_ENTRIES,
  filterEncyclopediaTerms,
  getEncyclopediaTerm,
  groupEncyclopediaByCategory,
  listBrokenEncyclopediaSeeAlso,
  listEncyclopediaTerms,
} from '../ui/hoverHelp/encyclopedia.js';
import { getHelpEntry } from '../ui/hoverHelp/helpContent.js';

describe('encyclopedia', () => {
  it('lists a non-empty curated catalog', () => {
    const terms = listEncyclopediaTerms();
    expect(terms.length).toBeGreaterThanOrEqual(25);
    expect(terms.length).toBe(ENCYCLOPEDIA_ENTRIES.length);
    expect(new Set(terms.map((t) => t.id)).size).toBe(terms.length);
  });

  it('filters by term, category, and body', () => {
    expect(filterEncyclopediaTerms('brush').some((t) => t.id === 'brush')).toBe(true);
    expect(filterEncyclopediaTerms('Lighting').every((t) => (
      t.category === 'Lighting'
      || t.body.toLowerCase().includes('lighting')
      || t.term.toLowerCase().includes('lighting')
      || t.id.includes('light')
    ))).toBe(true);
    expect(filterEncyclopediaTerms('100 editor units').some((t) => t.id === 'editor-units')).toBe(true);
    expect(filterEncyclopediaTerms('zzznomatch')).toEqual([]);
  });

  it('resolves every seeAlso id', () => {
    expect(listBrokenEncyclopediaSeeAlso()).toEqual([]);
    const prefab = getEncyclopediaTerm('prefab');
    expect(prefab?.seeAlso?.length).toBeGreaterThan(0);
    for (const id of prefab.seeAlso) {
      expect(getEncyclopediaTerm(id)?.id).toBe(id);
    }
  });

  it('groups by category with sorted terms', () => {
    const groups = groupEncyclopediaByCategory(listEncyclopediaTerms());
    expect(groups.length).toBeGreaterThan(1);
    for (const group of groups) {
      const names = group.terms.map((t) => t.term);
      expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    }
  });

  it('has Help menu hover content', () => {
    const entry = getHelpEntry('help.encyclopedia');
    expect(entry?.title).toBe('Encyclopedia');
    expect(entry?.body).toMatch(/Help → Encyclopedia/);
  });
});
