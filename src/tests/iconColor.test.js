import { describe, expect, it } from 'vitest';
import { Actor } from '../core/Actor.js';
import { normalizeIconColor } from '../core/iconColor.js';

describe('iconColor', () => {
  it('normalizes #rrggbb and rejects junk', () => {
    expect(normalizeIconColor('#AaBbCc')).toBe('#aabbcc');
    expect(normalizeIconColor('red')).toBeNull();
    expect(normalizeIconColor('#fff')).toBeNull();
    expect(normalizeIconColor('')).toBeNull();
  });

  it('round-trips actor iconColor in JSON', () => {
    const actor = new Actor({ name: 'Tinted', iconColor: '#4A8FD4' });
    expect(actor.iconColor).toBe('#4a8fd4');
    const json = actor.toJSON();
    expect(json.iconColor).toBe('#4a8fd4');
    const restored = Actor.fromJSON(json);
    expect(restored.iconColor).toBe('#4a8fd4');
    const plain = new Actor({ name: 'Plain' });
    expect(plain.toJSON().iconColor).toBeUndefined();
  });
});
