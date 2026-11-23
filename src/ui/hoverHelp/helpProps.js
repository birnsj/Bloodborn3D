/**
 * Attach hover-help metadata to a control without changing its behavior.
 * Usage: <button {...helpProps('toolbar.select', isPlay && 'Unavailable during Play mode.')} />
 */
export function helpProps(id, disabledReason = null, meta = null) {
  if (!id) return {};
  const props = { 'data-bb-help': id };
  if (disabledReason) {
    props['data-bb-help-disabled'] = String(disabledReason);
  }
  if (meta) {
    props['data-bb-help-meta'] = String(meta);
  }
  return props;
}
