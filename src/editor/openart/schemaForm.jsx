/**
 * Dynamic OpenArt form fields from CLI `model form` JSON Schema.
 * Primary fields stay visible; secondary/advanced collapse.
 * Unsupported shapes get a safe JSON/text fallback — never silently hidden.
 */

/** Always shown when present (besides dedicated prompt / reference UI). */
const PRIMARY_KEYS = new Set([
  'negativePrompt',
  'negative_prompt',
  'aspectRatio',
  'aspect_ratio',
  'resolution',
  'width',
  'height',
  'imageCount',
  'image_count',
  'size',
]);

/** Handled by dedicated OpenArt controls (not SchemaField). */
const SKIP_KEYS = new Set(['prompt', 'image', 'images', 'reference', 'referenceImage']);

export function partitionSchemaKeys(properties = {}) {
  const primary = [];
  const advanced = [];
  for (const key of Object.keys(properties)) {
    if (SKIP_KEYS.has(key)) continue;
    if (PRIMARY_KEYS.has(key)) primary.push(key);
    else advanced.push(key);
  }
  return { primary, advanced };
}

export function humanizeFieldName(name) {
  return String(name || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function looksLikeLongText(name, schema) {
  const n = String(name).toLowerCase();
  if (n.includes('prompt') || n.includes('negative')) return true;
  if (schema?.maxLength && schema.maxLength > 120) return true;
  if (schema?.format === 'textarea' || schema?.['x-ui'] === 'textarea') return true;
  return false;
}

function looksLikeImageField(name, schema) {
  const n = String(name).toLowerCase();
  if (n.includes('image') || n.includes('reference') || n.includes('mask')) return true;
  if (schema?.format === 'binary' || schema?.format === 'data-url' || schema?.contentMediaType?.startsWith?.('image/')) {
    return true;
  }
  return false;
}

/**
 * Render one schema property. Always returns a control (fallback for unknown shapes).
 */
export function SchemaField({
  name,
  schema,
  value,
  disabled,
  onChange,
  onPickFile = null,
  fileName = null,
}) {
  const label = humanizeFieldName(name);
  const description = schema?.description || schema?.title || null;

  if (schema?.enum && Array.isArray(schema.enum)) {
    return (
      <label className="bb-field">
        <span className="bb-field-caption">{label}</span>
        {description && <span className="bb-muted bb-field-help">{description}</span>}
        <select
          className="bb-select"
          value={value ?? schema.default ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          {schema.enum.map((opt) => (
            <option key={String(opt)} value={opt}>{String(opt)}</option>
          ))}
        </select>
      </label>
    );
  }

  if (schema?.type === 'boolean') {
    return (
      <label className="bb-field bb-field--row">
        <input
          type="checkbox"
          checked={Boolean(value ?? schema.default)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="bb-field-caption">{label}</span>
        {description && <span className="bb-muted bb-field-help">{description}</span>}
      </label>
    );
  }

  if (schema?.type === 'integer' || schema?.type === 'number') {
    const min = schema.minimum ?? schema.exclusiveMinimum;
    const max = schema.maximum ?? schema.exclusiveMaximum;
    const step = schema.type === 'integer' ? 1 : (schema.multipleOf || 'any');
    const numVal = value ?? schema.default ?? (min != null ? min : 0);
    const showSlider = typeof min === 'number' && typeof max === 'number';
    return (
      <label className="bb-field">
        <span className="bb-field-caption">{label}</span>
        {description && <span className="bb-muted bb-field-help">{description}</span>}
        <div className="bb-schema-number">
          {showSlider && (
            <input
              className="bb-schema-slider"
              type="range"
              min={min}
              max={max}
              step={step === 'any' ? (schema.type === 'integer' ? 1 : 0.01) : step}
              value={Number(numVal)}
              disabled={disabled}
              onChange={(e) => onChange(schema.type === 'integer'
                ? parseInt(e.target.value, 10)
                : Number(e.target.value))}
            />
          )}
          <input
            className="bb-input bb-schema-number__input"
            type="number"
            value={numVal}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(e) => onChange(schema.type === 'integer'
              ? parseInt(e.target.value, 10)
              : Number(e.target.value))}
          />
        </div>
      </label>
    );
  }

  if (looksLikeImageField(name, schema) && typeof onPickFile === 'function') {
    return (
      <div className="bb-field">
        <span className="bb-field-caption">{label}</span>
        {description && <span className="bb-muted bb-field-help">{description}</span>}
        <div className="bb-openart__ref-row">
          <button type="button" className="bb-btn" disabled={disabled} onClick={onPickFile}>
            Choose image…
          </button>
          <span className="bb-muted bb-openart__ref-name">{fileName || 'None'}</span>
        </div>
      </div>
    );
  }

  if (schema?.type === 'string' || schema?.type == null && typeof (value ?? schema?.default) === 'string') {
    if (looksLikeLongText(name, schema)) {
      return (
        <label className="bb-field">
          <span className="bb-field-caption">{label}</span>
          {description && <span className="bb-muted bb-field-help">{description}</span>}
          <textarea
            className="bb-input bb-openart__prompt"
            rows={3}
            value={value ?? ''}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );
    }
    return (
      <label className="bb-field">
        <span className="bb-field-caption">{label}</span>
        {description && <span className="bb-muted bb-field-help">{description}</span>}
        <input
          className="bb-input"
          type="text"
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }

  // Safe fallback — never hide unknown shapes.
  const fallbackValue = value === undefined || value === null
    ? (schema?.default !== undefined ? JSON.stringify(schema.default, null, 2) : '')
    : (typeof value === 'string' ? value : JSON.stringify(value, null, 2));

  return (
    <label className="bb-field">
      <span className="bb-field-caption">{label} <span className="bb-muted">(advanced)</span></span>
      {description && <span className="bb-muted bb-field-help">{description}</span>}
      <span className="bb-muted bb-field-help">
        Schema type: {schema?.type || 'unknown'} — edit as JSON
      </span>
      <textarea
        className="bb-input bb-openart__prompt"
        rows={3}
        value={fallbackValue}
        disabled={disabled}
        spellCheck={false}
        onChange={(e) => {
          const raw = e.target.value;
          try {
            onChange(JSON.parse(raw));
          } catch {
            onChange(raw);
          }
        }}
      />
    </label>
  );
}
