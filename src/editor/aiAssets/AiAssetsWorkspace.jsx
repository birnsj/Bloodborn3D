import { useCallback, useEffect, useRef, useState } from 'react';

import { ConceptLibraryPanel } from '../conceptLibrary/ConceptLibraryPanel.jsx';
import { OpenArtControls } from '../openart/OpenArtControls.jsx';
import { OpenArtResults } from '../openart/OpenArtResults.jsx';
import {
  getAiAssetsUiState,
  setAiAssetsSection,
  subscribeAiAssetsUi,
} from './aiAssetsUiStore.js';
import { getAiProvider } from './providers.js';
import { ProviderNav } from './ProviderNav.jsx';

const NAV_MIN = 180;
const NAV_MAX = 240;
const SETTINGS_MIN = 360;
const SETTINGS_MAX = 480;

/**
 * Phase 2H.1C/D — AI Assets workspace.
 * Top sections: Concept Library | Asset Generation
 */
export function AiAssetsWorkspace() {
  const [ui, setUi] = useState(() => getAiAssetsUiState());
  useEffect(() => subscribeAiAssetsUi(setUi), []);

  const provider = getAiProvider(ui.selectedProviderId);
  const isConcepts = ui.section !== 'generation';

  return (
    <div className="bb-workspace bb-ai-assets-shell" data-bb-tutorial="workspace.ai">
      <div className="bb-ai-assets-shell__tabs">
        <button
          type="button"
          className={`bb-ai-assets-shell__tab${isConcepts ? ' is-active' : ''}`}
          onClick={() => setAiAssetsSection('concepts')}
        >
          Concept Library
        </button>
        <button
          type="button"
          className={`bb-ai-assets-shell__tab${!isConcepts ? ' is-active' : ''}`}
          onClick={() => setAiAssetsSection('generation')}
        >
          Asset Generation
        </button>
      </div>

      {isConcepts ? (
        <ConceptLibraryPanel />
      ) : (
        <GenerationWorkspace
          provider={provider}
          selectedProviderId={ui.selectedProviderId}
          conceptSaveMode={Boolean(ui.conceptSaveTargetAreaId)}
        />
      )}
    </div>
  );
}

function GenerationWorkspace({ provider, selectedProviderId, conceptSaveMode }) {
  const [navW, setNavW] = useState(200);
  const [settingsW, setSettingsW] = useState(400);

  return (
    <div
      className="bb-ai-assets"
      style={{
        '--bb-ai-nav-w': `${navW}px`,
        '--bb-ai-settings-w': `${settingsW}px`,
      }}
    >
      <aside className="bb-panel-chrome bb-ai-assets__nav">
        <div className="bb-panel-chrome__head">
          <span className="bb-panel-chrome__title">Providers</span>
        </div>
        <ProviderNav selectedProviderId={selectedProviderId} />
      </aside>

      <ColumnResizeHandle
        ariaLabel="Resize providers column"
        onDelta={(delta) => {
          setNavW((w) => clamp(w + delta, NAV_MIN, NAV_MAX));
        }}
      />

      <section className="bb-panel-chrome bb-ai-assets__controls">
        <div className="bb-panel-chrome__head">
          <span className="bb-panel-chrome__title">Generation Settings</span>
          {provider?.status === 'coming_soon' && (
            <span className="bb-ai-assets__badge">Coming soon</span>
          )}
          {conceptSaveMode && (
            <span className="bb-ai-assets__badge">Concept save mode</span>
          )}
        </div>
        <div className="bb-panel-chrome__body bb-ai-assets__controls-body">
          {provider?.id === 'openart' ? (
            <OpenArtControls />
          ) : (
            <ComingSoonPanel provider={provider} />
          )}
        </div>
      </section>

      <ColumnResizeHandle
        ariaLabel="Resize generation settings column"
        onDelta={(delta) => {
          setSettingsW((w) => clamp(w + delta, SETTINGS_MIN, SETTINGS_MAX));
        }}
      />

      <section className="bb-panel-chrome bb-ai-assets__results">
        <div className="bb-panel-chrome__head bb-ai-assets__results-head">
          <span className="bb-panel-chrome__title">Result Preview</span>
        </div>
        <div className="bb-panel-chrome__body bb-ai-assets__results-body">
          {provider?.id === 'openart' ? (
            <OpenArtResults />
          ) : (
            <div className="bb-muted bb-ai-assets__empty-results">
              Select an available provider to generate assets.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ColumnResizeHandle({ onDelta, ariaLabel }) {
  const dragging = useRef(false);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.classList.add('is-dragging');
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!dragging.current) return;
    onDelta?.(e.movementX);
  }, [onDelta]);

  const onPointerUp = useCallback((e) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.classList.remove('is-dragging');
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  return (
    <div
      className="bb-resize-v bb-ai-assets__splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}

function ComingSoonPanel({ provider }) {
  return (
    <div className="bb-ai-assets__coming-soon">
      <h3>{provider?.name || 'Provider'}</h3>
      <p>{provider?.blurb || 'This provider is not available yet.'}</p>
      <p className="bb-muted">
        The workspace layout already reserves a slot — no redesign needed when this ships.
      </p>
    </div>
  );
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
