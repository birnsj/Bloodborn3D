import { useEffect, useState } from 'react';
import { useLayout } from '../layout/LayoutContext.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { MaterialDefinitionForm } from '../materials/MaterialDefinitionForm.jsx';
import {
  cloneMaterialDraft,
  isMaterialDraftDirty,
  materialDraftToSavePayload,
} from '../materials/materialDraft.js';

export function MaterialDefinitionEditor({
  materialId,
  disabled,
  getMaterialDefinition,
  saveMaterialDefinition,
}) {
  const { setWorkspace } = useLayout();
  const [baseline, setBaseline] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBaseline(null);
    setDraft(null);
    getMaterialDefinition(materialId).then((d) => {
      if (cancelled || !d) return;
      const cloned = cloneMaterialDraft(d);
      setBaseline(cloned);
      setDraft(cloneMaterialDraft(d));
    });
    return () => { cancelled = true; };
  }, [materialId, getMaterialDefinition]);

  if (!draft) {
    return <p className="bb-muted">Loading material…</p>;
  }

  const dirty = isMaterialDraftDirty(baseline, draft);

  const onCancel = () => {
    if (!baseline) return;
    setDraft(cloneMaterialDraft(baseline));
  };

  const onSave = async () => {
    if (!dirty || disabled) return;
    const payload = materialDraftToSavePayload(draft);
    if (!payload) return;
    setSaving(true);
    try {
      const saved = await saveMaterialDefinition(materialId, payload);
      const cloned = cloneMaterialDraft(saved);
      setBaseline(cloned);
      setDraft(cloneMaterialDraft(saved));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bb-material-def">
      <div className="bb-field-caption">
        Shared material asset
        {dirty ? ' • unsaved' : ''}
      </div>
      <div className="bb-field-row" style={{ gap: 6, marginBottom: 6 }}>
        <button
          type="button"
          className="bb-btn"
          disabled={disabled || !dirty || saving}
          onClick={onCancel}
          {...helpProps('details.material.cancel', !dirty ? 'No unsaved material changes.' : null)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="bb-btn bb-btn--primary"
          disabled={disabled || !dirty || saving}
          onClick={() => { void onSave(); }}
          {...helpProps('details.material.save', !dirty ? 'No unsaved material changes.' : null)}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={disabled}
          onClick={() => { void setWorkspace('materials'); }}
          title="Open Materials workspace"
          {...helpProps('details.material.openWorkspace')}
        >
          Materials…
        </button>
      </div>
      <MaterialDefinitionForm
        draft={draft}
        onChange={setDraft}
        disabled={disabled || saving}
      />
    </div>
  );
}
