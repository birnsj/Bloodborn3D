/**
 * Shared #rrggbb icon tint for Content Browser / Outliner list rows.
 */

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export function normalizeIconColor(raw, fallback = null) {
  const value = String(raw || '').trim();
  if (!HEX6.test(value)) return fallback;
  return value.toLowerCase();
}

export function isIconColor(raw) {
  return normalizeIconColor(raw) != null;
}
