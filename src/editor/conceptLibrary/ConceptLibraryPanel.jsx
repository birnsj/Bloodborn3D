import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import {
  setAiAssetsSection,
  setConceptSaveTargetAreaId,
  setGenerationOrigin,
  selectAiProvider,
} from '../aiAssets/aiAssetsUiStore.js';
import { useLayout } from '../layout/LayoutContext.jsx';
import {
  getOpenArtUiState,
  openArtApplySeed,
  openArtConnect,
  openArtSetReference,
} from '../openart/openArtUiStore.js';
import {
  MAX_CONCEPTS_PER_AREA,
  PROMPT_CATEGORIES,
  conceptLibraryAnalyze,
  conceptLibraryCreateArea,
  conceptLibraryCreatePrompt,
  conceptLibraryDeleteArea,
  conceptLibraryDeleteConcept,
  conceptLibraryDeletePrompt,
  conceptLibraryDuplicateArea,
  conceptLibraryDuplicatePrompt,
  conceptLibraryImportImage,
  conceptLibraryLoad,
  conceptLibraryReorder,
  conceptLibrarySetPrimary,
  conceptLibraryStageReference,
  conceptLibraryUpdateArea,
  conceptLibraryUpdateConcept,
  conceptLibraryUpdatePrompt,
  conceptPreviewUrl,
  getAreaConcepts,
  getConceptLibraryState,
  getFilteredPrompts,
  getSelectedArea,
  getSelectedConcept,
  selectConcept,
  selectConceptArea,
  selectPrompt,
  setConceptCenterMode,
  setPromptFilter,
  subscribeConceptLibrary,
} from './conceptLibraryStore.js';
import {
  buildFinalConceptPrompt,
  createGenerationOrigin,
  openArtSupportsReferenceImages,
  preferReferenceMode,
} from './conceptGeneration.js';
import { mergeAnalysisSuggestions } from './visionProvider.js';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';

/**
 * Phase 2H.1D — Concept Library three-column UI.
 */
export function ConceptLibraryPanel() {
  const [ui, setUi] = useState(() => getConceptLibraryState());
  const { patch } = useLayout();
  const { confirm, prompt } = useEditorDialogs();
  const { notify, setStatus, selectAsset } = useAssetBrowser();
  const fileRef = useRef(null);
  const loadedRef = useRef(false);

  useEffect(() => subscribeConceptLibrary(setUi), []);
  useEffect(() => {
    if (loadedRef.current) return undefined;
    loadedRef.current = true;
    conceptLibraryLoad().catch((err) => notify(err.message));
    return undefined;
  }, [notify]);

  const area = getSelectedArea();
  const concepts = getAreaConcepts();
  const selectedConcept = getSelectedConcept();
  const prompts = getFilteredPrompts();
  const selectedPrompt = ui.library.prompts.find((p) => p.id === ui.selectedPromptId) || null;
  const atLimit = concepts.length >= MAX_CONCEPTS_PER_AREA;

  const onCreateArea = useCallback(async () => {
    const name = await prompt('Area name', {
      title: 'New area',
      initialValue: 'New Area',
    });
    if (!name) return;
    try {
      await conceptLibraryCreateArea({ name });
      setStatus(`Created area “${name}”`);
    } catch (err) {
      notify(err.message);
    }
  }, [notify, prompt, setStatus]);

  const onImport = useCallback(async (file) => {
    if (!file || !ui.selectedAreaId) return;
    try {
      await conceptLibraryImportImage({
        areaId: ui.selectedAreaId,
        file,
        title: file.name.replace(/\.[^.]+$/, ''),
      });
      setStatus(`Imported concept ${file.name}`);
    } catch (err) {
      notify(err.message);
    }
  }, [notify, setStatus, ui.selectedAreaId]);

  const onGenerateConcept = useCallback(() => {
    if (!ui.selectedAreaId) {
      notify('Create or select an area first');
      return;
    }
    if (atLimit) {
      notify(`This area already has ${MAX_CONCEPTS_PER_AREA} concepts`);
      return;
    }
    setGenerationOrigin(null);
    setConceptSaveTargetAreaId(ui.selectedAreaId);
    selectAiProvider('openart');
    setAiAssetsSection('generation');
    setStatus('Generate a concept in OpenArt, then Save to Concept Library');
  }, [atLimit, notify, setStatus, ui.selectedAreaId]);

  const onGenerateAsset = useCallback(async (promptEntry, concept) => {
    const text = promptEntry?.promptText || concept?.generationPrompt || '';
    if (!text.trim()) {
      notify('No prompt text to generate from');
      return;
    }
    const finalPrompt = buildFinalConceptPrompt({
      artDirection: area?.artDirection,
      promptText: text,
    });

    const ok = await confirm(
      `Open OpenArt with this final submitted prompt?\n\n${finalPrompt}`,
      {
        title: 'Generate Asset',
        confirmLabel: 'Open OpenArt',
        cancelLabel: 'Cancel',
      },
    );
    if (!ok) return;

    const origin = createGenerationOrigin({
      areaId: area?.id || concept?.areaId || null,
      conceptId: concept?.id || null,
      promptId: promptEntry?.id || null,
      finalPrompt,
    });
    setGenerationOrigin(origin);
    setConceptSaveTargetAreaId(null);
    selectAiProvider('openart');
    setAiAssetsSection('generation');

    const formValues = {
      ...(promptEntry?.generationParams || {}),
    };
    if (promptEntry?.negativePrompt) {
      formValues.negativePrompt = promptEntry.negativePrompt;
    }

    try {
      await openArtConnect().catch(() => {});
      // Apply preferred model first so reference-support checks use the right schema/modes.
      await openArtApplySeed({
        prompt: finalPrompt,
        modelId: promptEntry?.preferredModel || null,
        formValues,
      });

      const oa = getOpenArtUiState();
      const model = oa.imageModels.find((m) => m.id === oa.modelId);
      const availableModes = model?.modes?.image || [{ mode: 'text2image' }];
      const schemaProperties = oa.form?.jsonSchema?.properties || {};
      const supportsRefs = openArtSupportsReferenceImages({
        mode: oa.mode,
        schemaProperties,
        availableModes,
      });

      let referenceFileName = null;
      let referenceStagingPath = null;
      let mode = null;

      if (supportsRefs && concept?.id && concept?.imagePath) {
        try {
          const staged = await conceptLibraryStageReference(concept.id);
          referenceFileName = staged.originalName || staged.fileName || 'concept-reference';
          referenceStagingPath = staged.absolutePath;
          mode = preferReferenceMode({
            availableModes,
            currentMode: oa.mode,
            hasReference: true,
          });
        } catch (err) {
          if (err.code === 'MISSING_IMAGE') {
            notify('Concept image is missing — seeding prompt only (no reference)');
          } else {
            notify(err.message || 'Could not stage concept reference');
          }
        }
      }

      if (referenceStagingPath || mode) {
        await openArtApplySeed({
          prompt: finalPrompt,
          mode,
          referenceFileName,
          referenceStagingPath,
        });
      }
      if (!referenceStagingPath) openArtSetReference({});
      setStatus(referenceStagingPath
        ? 'OpenArt seeded with concept reference — estimate before spending'
        : 'OpenArt seeded from Concept Library — estimate before spending');
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [area, confirm, notify, setStatus]);

  return (
    <div className="bb-concept-library">
      <aside className="bb-panel-chrome bb-concept-library__nav">
        <div className="bb-panel-chrome__head">
          <span className="bb-panel-chrome__title">Areas</span>
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            onClick={onCreateArea}
            {...helpProps('concept.area.new')}
          >
            New
          </button>
        </div>
        <div className="bb-panel-chrome__body bb-concept-library__nav-body">
          <AreaList
            areas={ui.library.areas}
            selectedAreaId={ui.selectedAreaId}
            onSelect={selectConceptArea}
            onRename={async (a) => {
              const name = await prompt('Rename area', { title: 'Rename area', initialValue: a.name });
              if (!name) return;
              await conceptLibraryUpdateArea(a.id, { name }).catch((err) => notify(err.message));
            }}
            onDuplicate={(id) => conceptLibraryDuplicateArea(id).catch((err) => notify(err.message))}
            onDelete={async (id) => {
              const ok = await confirm('Delete this area and its concept images? Production textures/materials are not affected.', {
                title: 'Delete area',
                confirmLabel: 'Delete',
                tone: 'warning',
              });
              if (!ok) return;
              await conceptLibraryDeleteArea(id).catch((err) => notify(err.message));
            }}
          />
          <div className="bb-concept-library__cats">
            <div className="bb-field-caption">Prompt categories</div>
            <button
              type="button"
              className={`bb-concept-library__cat${ui.promptFilter.category === 'all' ? ' is-active' : ''}`}
              onClick={() => { setPromptFilter({ category: 'all' }); setConceptCenterMode('prompts'); }}
            >
              All prompts
            </button>
            {PROMPT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`bb-concept-library__cat${ui.promptFilter.category === cat.id ? ' is-active' : ''}`}
                onClick={() => { setPromptFilter({ category: cat.id }); setConceptCenterMode('prompts'); }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="bb-panel-chrome bb-concept-library__center">
        <div className="bb-panel-chrome__head">
          <div className="bb-concept-library__tabs" {...helpProps('concept.tabs')}>
            <button
              type="button"
              className={`bb-btn${ui.centerMode === 'concepts' ? ' bb-btn--primary' : ''}`}
              onClick={() => setConceptCenterMode('concepts')}
            >
              Concepts
            </button>
            <button
              type="button"
              className={`bb-btn${ui.centerMode === 'prompts' ? ' bb-btn--primary' : ''}`}
              onClick={() => setConceptCenterMode('prompts')}
            >
              Prompts
            </button>
          </div>
          <div className="bb-concept-library__actions">
            <button
              type="button"
              className="bb-btn"
              disabled={!ui.selectedAreaId || atLimit || ui.busy}
              onClick={() => fileRef.current?.click()}
              {...helpProps(
                'concept.import',
                !ui.selectedAreaId
                  ? 'Select an area first.'
                  : (atLimit ? 'This area is at its concept limit.' : null),
              )}
            >
              Import Concept
            </button>
            <button
              type="button"
              className="bb-btn"
              disabled={!ui.selectedAreaId || atLimit || ui.busy}
              onClick={onGenerateConcept}
              {...helpProps(
                'concept.generate',
                !ui.selectedAreaId
                  ? 'Select an area first.'
                  : (atLimit ? 'This area is at its concept limit.' : null),
              )}
            >
              Generate Concept
            </button>
            <button
              type="button"
              className="bb-btn"
              disabled={!ui.selectedAreaId || ui.busy}
              {...helpProps(
                'concept.prompt.new',
                ui.selectedAreaId ? null : 'Select an area first.',
              )}
              onClick={async () => {
                try {
                  await conceptLibraryCreatePrompt({
                    areaId: ui.selectedAreaId,
                    conceptIds: selectedConcept ? [selectedConcept.id] : [],
                    name: 'New prompt',
                    category: ui.promptFilter.category === 'all' ? 'other' : ui.promptFilter.category,
                  });
                  setConceptCenterMode('prompts');
                } catch (err) {
                  notify(err.message);
                }
              }}
            >
              Add Prompt
            </button>
          </div>
        </div>
        <div className="bb-panel-chrome__body bb-concept-library__center-body">
          {!area && <div className="bb-muted">Create an area to begin.</div>}
          {area && ui.centerMode === 'concepts' && (
            <>
              <div className="bb-muted bb-concept-library__limit">
                {concepts.length} / {MAX_CONCEPTS_PER_AREA} concepts
                {atLimit ? ' — limit reached' : ''}
              </div>
              <ConceptGallery
                area={area}
                concepts={concepts}
                selectedConceptId={ui.selectedConceptId}
                onSelect={selectConcept}
                onReorder={(order) => conceptLibraryReorder(area.id, order).catch((err) => notify(err.message))}
                onPrimary={(id) => conceptLibrarySetPrimary(area.id, id).catch((err) => notify(err.message))}
              />
            </>
          )}
          {area && ui.centerMode === 'prompts' && (
            <PromptList
              prompts={prompts}
              filter={ui.promptFilter}
              selectedPromptId={ui.selectedPromptId}
              onFilter={setPromptFilter}
              onSelect={selectPrompt}
            />
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onImport(file);
          }}
        />
      </section>

      <section className="bb-panel-chrome bb-concept-library__detail">
        <div className="bb-panel-chrome__head">
          <span className="bb-panel-chrome__title">
            {ui.centerMode === 'prompts' ? 'Prompt' : 'Concept'}
          </span>
        </div>
        <div className="bb-panel-chrome__body bb-concept-library__detail-body">
          {ui.centerMode === 'concepts' ? (
            <ConceptDetail
              area={area}
              concept={selectedConcept}
              vision={ui.vision}
              prompts={ui.library.prompts}
              busy={ui.busy}
              notify={notify}
              onGenerateAsset={onGenerateAsset}
              confirm={confirm}
              onOpenAsset={(ref) => openAssociatedAsset(ref, { selectAsset, patch, notify })}
            />
          ) : (
            <PromptDetail
              promptEntry={selectedPrompt}
              concepts={concepts}
              busy={ui.busy}
              notify={notify}
              onGenerateAsset={onGenerateAsset}
              onOpenAsset={(ref) => openAssociatedAsset(ref, { selectAsset, patch, notify })}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function AreaList({ areas, selectedAreaId, onSelect, onRename, onDuplicate, onDelete }) {
  return (
    <ul className="bb-concept-library__area-list">
      {areas.map((area) => (
        <li key={area.id}>
          <button
            type="button"
            className={`bb-concept-library__area${selectedAreaId === area.id ? ' is-active' : ''}`}
            onClick={() => onSelect(area.id)}
          >
            <span className="bb-concept-library__area-name">{area.name}</span>
            <span className="bb-muted">{area.conceptOrder.length}</span>
          </button>
          {selectedAreaId === area.id && (
            <div className="bb-concept-library__area-tools" {...helpProps('concept.area.actions')}>
              <button type="button" className="bb-btn bb-btn--ghost" onClick={() => onRename(area)}>Rename</button>
              <button type="button" className="bb-btn bb-btn--ghost" onClick={() => onDuplicate(area.id)}>Duplicate</button>
              <button type="button" className="bb-btn bb-btn--ghost" onClick={() => onDelete(area.id)}>Delete</button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function ConceptGallery({ area, concepts, selectedConceptId, onSelect, onReorder, onPrimary }) {
  return (
    <div className="bb-concept-gallery">
      {concepts.map((concept, index) => {
        const url = conceptPreviewUrl(concept);
        const isPrimary = area.primaryConceptId === concept.id;
        return (
          <div
            key={concept.id}
            className={`bb-concept-tile${selectedConceptId === concept.id ? ' is-active' : ''}${isPrimary ? ' is-primary' : ''}`}
          >
            <button type="button" className="bb-concept-tile__hit" onClick={() => onSelect(concept.id)}>
              {url ? (
                <img src={url} alt={concept.title} className="bb-concept-tile__img" />
              ) : (
                <div className="bb-concept-tile__empty bb-muted">No image</div>
              )}
              <span className="bb-concept-tile__title">{concept.title}</span>
            </button>
            <div className="bb-concept-tile__tools" {...helpProps('concept.card')}>
              <button
                type="button"
                className="bb-btn bb-btn--ghost"
                disabled={index === 0}
                onClick={() => {
                  const order = concepts.map((c) => c.id);
                  [order[index - 1], order[index]] = [order[index], order[index - 1]];
                  onReorder(order);
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className="bb-btn bb-btn--ghost"
                disabled={index === concepts.length - 1}
                onClick={() => {
                  const order = concepts.map((c) => c.id);
                  [order[index + 1], order[index]] = [order[index], order[index + 1]];
                  onReorder(order);
                }}
              >
                ↓
              </button>
              <button
                type="button"
                className="bb-btn bb-btn--ghost"
                disabled={isPrimary}
                onClick={() => onPrimary(concept.id)}
              >
                {isPrimary ? 'Primary' : 'Set primary'}
              </button>
            </div>
          </div>
        );
      })}
      {!concepts.length && <div className="bb-muted">No concepts yet — Import or Generate.</div>}
    </div>
  );
}

function PromptList({ prompts, filter, selectedPromptId, onFilter, onSelect }) {
  return (
    <div className="bb-concept-prompts">
      <div className="bb-concept-prompts__filters">
        <input
          className="bb-input"
          placeholder="Search prompts"
          value={filter.query}
          onChange={(e) => onFilter({ query: e.target.value })}
        />
        <input
          className="bb-input"
          placeholder="Tags (comma)"
          value={filter.tags}
          onChange={(e) => onFilter({ tags: e.target.value })}
        />
      </div>
      <ul className="bb-concept-prompts__list">
        {prompts.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={`bb-concept-prompts__item${selectedPromptId === p.id ? ' is-active' : ''}`}
              onClick={() => onSelect(p.id)}
            >
              <span className="bb-concept-prompts__name">{p.name}</span>
              <span className="bb-muted">{PROMPT_CATEGORIES.find((c) => c.id === p.category)?.label || p.category}</span>
            </button>
          </li>
        ))}
      </ul>
      {!prompts.length && <div className="bb-muted">No prompts match.</div>}
    </div>
  );
}

function ConceptDetail({
  area, concept, vision, prompts, busy, notify, onGenerateAsset, confirm, onOpenAsset,
}) {
  const [draft, setDraft] = useState(null);
  const [metaOpen, setMetaOpen] = useState(false);

  useEffect(() => {
    setDraft(concept ? { ...concept, tags: [...(concept.tags || [])] } : null);
  }, [concept]);

  if (!area) return <div className="bb-muted">Select an area.</div>;
  if (!concept || !draft) return <div className="bb-muted">Select a concept thumbnail.</div>;

  const url = conceptPreviewUrl(concept);
  const linkedPrompts = prompts.filter((p) => (concept.associatedPromptIds || []).includes(p.id)
    || (p.conceptIds || []).includes(concept.id));
  const assetRefs = concept.generatedAssetRefs || [];

  return (
    <div className="bb-concept-detail">
      <div className="bb-concept-detail__hero">
        {url ? (
          <img className="bb-concept-detail__preview" src={url} alt={concept.title} />
        ) : (
          <div className="bb-concept-detail__preview-empty bb-muted">No preview</div>
        )}
      </div>

      <div className="bb-concept-detail__controls">
        <div className="bb-concept-detail__toolbar">
          <label className="bb-field bb-concept-detail__title">
            <span className="bb-field-caption">Title</span>
            <input
              className="bb-input"
              value={draft.title}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <div className="bb-concept-detail__actions">
            <button
              type="button"
              className="bb-btn"
              disabled={busy}
              onClick={() => conceptLibraryUpdateConcept(concept.id, draft).catch((err) => notify(err.message))}
              {...helpProps('concept.detail.save')}
            >
              Save
            </button>
            <button
              type="button"
              className="bb-btn"
              disabled={busy}
              title={vision?.reason || 'Vision analysis'}
              {...helpProps('concept.analyze', vision?.reason || null)}
              onClick={async () => {
                const result = await conceptLibraryAnalyze(concept.id).catch((err) => {
                  notify(err.message);
                  return null;
                });
                if (!result) return;
                if (!result.ok) {
                  notify(result.error || 'Image analysis is not available');
                  return;
                }
                const merged = mergeAnalysisSuggestions(draft, result.suggestions, { overwriteEmptyOnly: true });
                setDraft(merged);
                notify('Suggestions applied to empty fields only — review and Save');
              }}
            >
              Analyze…
            </button>
            <button
              type="button"
              className="bb-btn bb-btn--primary"
              disabled={busy}
              onClick={() => onGenerateAsset(null, draft)}
              {...helpProps('concept.generateAsset')}
            >
              Generate Asset
            </button>
            <button
              type="button"
              className="bb-btn bb-btn--ghost"
              disabled={busy}
              onClick={async () => {
                const ok = await confirm('Delete this concept image from the library? Production assets are unaffected.', {
                  title: 'Delete concept',
                  confirmLabel: 'Delete',
                  tone: 'warning',
                });
                if (!ok) return;
                await conceptLibraryDeleteConcept(concept.id).catch((err) => notify(err.message));
              }}
              {...helpProps('concept.delete')}
            >
              Delete
            </button>
          </div>
        </div>

        <details className="bb-concept-detail__more">
          <summary className="bb-concept-detail__summary">
            Direction, metadata & associations
          </summary>
          <div className="bb-concept-detail__more-body">
            <AreaDirectionEditor area={area} busy={busy} notify={notify} />

            <details open={metaOpen} onToggle={(e) => setMetaOpen(e.currentTarget.open)}>
              <summary className="bb-concept-detail__summary">Metadata</summary>
              <div className="bb-concept-detail__meta">
                {[
                  ['description', 'Description', true],
                  ['generationPrompt', 'Original generation prompt', true],
                  ['architecturalStyle', 'Architectural style', false],
                  ['materials', 'Materials', false],
                  ['colorPalette', 'Color palette', false],
                  ['lighting', 'Lighting', false],
                  ['atmosphere', 'Atmosphere', false],
                  ['distinctiveElements', 'Distinctive visual elements', true],
                ].map(([key, label, long]) => (
                  <label key={key} className="bb-field">
                    <span className="bb-field-caption">{label}</span>
                    {long ? (
                      <textarea
                        className="bb-input bb-openart__prompt"
                        rows={3}
                        value={draft[key] || ''}
                        disabled={busy}
                        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                      />
                    ) : (
                      <input
                        className="bb-input"
                        value={draft[key] || ''}
                        disabled={busy}
                        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                      />
                    )}
                  </label>
                ))}
                <label className="bb-field">
                  <span className="bb-field-caption">Tags</span>
                  <input
                    className="bb-input"
                    value={(draft.tags || []).join(', ')}
                    disabled={busy}
                    onChange={(e) => setDraft({
                      ...draft,
                      tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                    })}
                  />
                </label>
              </div>
            </details>

            {concept.provenance && (
              <div className="bb-muted bb-concept-detail__prov">
                Provenance: {concept.provenance.source || 'unknown'}
                {concept.provenance.modelId ? ` · ${concept.provenance.modelId}` : ''}
                {concept.provenance.generationId ? ` · ${concept.provenance.generationId}` : ''}
              </div>
            )}

            <div className="bb-concept-detail__linked">
              <div className="bb-field-caption">Associated prompts</div>
              {linkedPrompts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="bb-btn bb-btn--ghost"
                  onClick={() => onGenerateAsset(p, concept)}
                >
                  Generate from “{p.name}”
                </button>
              ))}
              {!linkedPrompts.length && <div className="bb-muted">No linked prompts yet.</div>}
            </div>

            <div className="bb-concept-detail__linked">
              <div className="bb-field-caption">Associated production assets</div>
              {assetRefs.map((ref) => (
                <button
                  key={`${ref.kind}:${ref.id}`}
                  type="button"
                  className="bb-btn bb-btn--ghost"
                  onClick={() => onOpenAsset?.(ref)}
                >
                  {ref.kind}: {ref.name || ref.id}
                </button>
              ))}
              {!assetRefs.length && <div className="bb-muted">No generated assets linked yet.</div>}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

function AreaDirectionEditor({ area, busy, notify }) {
  const [description, setDescription] = useState(area.description || '');
  const [artDirection, setArtDirection] = useState(area.artDirection || '');
  useEffect(() => {
    setDescription(area.description || '');
    setArtDirection(area.artDirection || '');
  }, [area.id, area.description, area.artDirection]);

  return (
    <details className="bb-concept-detail__area-dir">
      <summary className="bb-concept-detail__summary">Area art direction</summary>
      <label className="bb-field">
        <span className="bb-field-caption">Description</span>
        <textarea
          className="bb-input bb-openart__prompt"
          rows={2}
          value={description}
          disabled={busy}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="bb-field">
        <span className="bb-field-caption">Overall art direction</span>
        <textarea
          className="bb-input bb-openart__prompt"
          rows={3}
          value={artDirection}
          disabled={busy}
          onChange={(e) => setArtDirection(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="bb-btn"
        disabled={busy}
        onClick={() => conceptLibraryUpdateArea(area.id, { description, artDirection })
          .catch((err) => notify(err.message))}
      >
        Save area direction
      </button>
    </details>
  );
}

function PromptDetail({ promptEntry, concepts, busy, notify, onGenerateAsset, onOpenAsset }) {
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    setDraft(promptEntry ? { ...promptEntry, tags: [...(promptEntry.tags || [])] } : null);
  }, [promptEntry]);

  if (!promptEntry || !draft) return <div className="bb-muted">Select a prompt.</div>;
  const assetRefs = promptEntry.generatedAssetRefs || [];

  return (
    <div className="bb-concept-detail">
      <label className="bb-field">
        <span className="bb-field-caption">Name</span>
        <input
          className="bb-input"
          value={draft.name}
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <label className="bb-field">
        <span className="bb-field-caption">Category</span>
        <select
          className="bb-select"
          value={draft.category}
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
        >
          {PROMPT_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </label>
      <label className="bb-field">
        <span className="bb-field-caption">Prompt text</span>
        <textarea
          className="bb-input bb-openart__prompt"
          rows={5}
          value={draft.promptText}
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, promptText: e.target.value })}
        />
      </label>
      <label className="bb-field">
        <span className="bb-field-caption">Negative prompt</span>
        <textarea
          className="bb-input bb-openart__prompt"
          rows={2}
          value={draft.negativePrompt}
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, negativePrompt: e.target.value })}
        />
      </label>
      <label className="bb-field">
        <span className="bb-field-caption">Preferred model</span>
        <input
          className="bb-input"
          value={draft.preferredModel || ''}
          disabled={busy}
          placeholder="e.g. nano-banana-2"
          onChange={(e) => setDraft({ ...draft, preferredModel: e.target.value })}
        />
      </label>
      <label className="bb-field">
        <span className="bb-field-caption">Tags</span>
        <input
          className="bb-input"
          value={(draft.tags || []).join(', ')}
          disabled={busy}
          onChange={(e) => setDraft({
            ...draft,
            tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
          })}
        />
      </label>
      <label className="bb-field">
        <span className="bb-field-caption">Linked concepts</span>
        <select
          className="bb-select"
          multiple
          value={draft.conceptIds || []}
          disabled={busy}
          onChange={(e) => {
            const ids = [...e.target.selectedOptions].map((o) => o.value);
            setDraft({ ...draft, conceptIds: ids });
          }}
        >
          {concepts.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </label>

      <div className="bb-concept-detail__actions">
        <button
          type="button"
          className="bb-btn"
          disabled={busy}
          onClick={() => conceptLibraryUpdatePrompt(promptEntry.id, draft).catch((err) => notify(err.message))}
        >
          Save prompt
        </button>
        <button
          type="button"
          className="bb-btn bb-btn--primary"
          disabled={busy || !draft.promptText.trim()}
          onClick={() => onGenerateAsset(draft, concepts.find((c) => (draft.conceptIds || []).includes(c.id)))}
        >
          Generate Asset
        </button>
        <button
          type="button"
          className="bb-btn bb-btn--ghost"
          disabled={busy}
          onClick={() => conceptLibraryDuplicatePrompt(promptEntry.id).catch((err) => notify(err.message))}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="bb-btn bb-btn--ghost"
          disabled={busy}
          onClick={() => conceptLibraryDeletePrompt(promptEntry.id).catch((err) => notify(err.message))}
        >
          Delete
        </button>
      </div>

      <div className="bb-concept-detail__linked">
        <div className="bb-field-caption">Associated production assets</div>
        {assetRefs.map((ref) => (
          <button
            key={`${ref.kind}:${ref.id}`}
            type="button"
            className="bb-btn bb-btn--ghost"
            onClick={() => onOpenAsset?.(ref)}
          >
            {ref.kind}: {ref.name || ref.id}
          </button>
        ))}
        {!assetRefs.length && <div className="bb-muted">No generated assets linked yet.</div>}
      </div>
    </div>
  );
}

function openAssociatedAsset(ref, { selectAsset, patch, notify }) {
  if (!ref?.id) {
    notify?.('Missing asset reference');
    return;
  }
  try {
    selectAsset?.(ref.id);
    patch?.({
      contentFolder: ref.kind === 'material' ? 'Materials' : 'Textures',
    });
  } catch (err) {
    notify?.(err.message || 'Could not open associated asset (it may have been deleted)');
  }
}
