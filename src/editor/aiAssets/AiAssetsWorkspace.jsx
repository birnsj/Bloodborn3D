import { useCallback, useEffect, useRef, useState } from 'react';

import { ProjectArtLibraryPanel } from '../projectArt/ProjectArtLibraryPanel.jsx';
import { OpenArtControls } from '../openart/OpenArtControls.jsx';
import { OpenArtResults } from '../openart/OpenArtResults.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import {
  getAiAssetsUiState,
  setAiAssetsSection,
  subscribeAiAssetsUi,
} from './aiAssetsUiStore.js';
import { getAiProvider } from './providers.js';
import { ProviderNav } from './ProviderNav.jsx';

const NAV_MIN = 160;
const NAV_MAX = 200;
const SETTINGS_MIN = 260;
const SETTINGS_MAX = 360;
const RESULTS_MIN = 360;

/**
 * Phase 2H.1C/D — AI Assets workspace.
 * Top sections: Project Art Library | Asset Generation
 */
export function AiAssetsWorkspace() {
  const [ui, setUi] = useState(() => getAiAssetsUiState());
  useEffect(() => subscribeAiAssetsUi(setUi), []);

  const provider = getAiProvider(ui.selectedProviderId);
  const isConcepts = ui.section !== 'generation';
  const artSaveMode = ui.artSaveTargetFolder != null;
  const conceptSaveMode = Boolean(ui.conceptSaveTargetAreaId);

  return (
    <div className="bb-workspace bb-ai-assets-shell" {...helpProps('workspace.ai')}>
      <div className="bb-ai-assets-shell__tabs">
        <button
          type="button"
          className={`bb-ai-assets-shell__tab${isConcepts ? ' is-active' : ''}`}
          onClick={() => setAiAssetsSection('concepts')}
          {...helpProps('ai.section.library')}
        >
          Project Art Library
        </button>
        <button
          type="button"
          className={`bb-ai-assets-shell__tab${!isConcepts ? ' is-active' : ''}`}
          onClick={() => setAiAssetsSection('generation')}
          {...helpProps('ai.section.generation')}
        >
          Asset Generation
        </button>
      </div>

      {isConcepts ? (
        <ProjectArtLibraryPanel />
      ) : (
        <GenerationWorkspace
          provider={provider}
          selectedProviderId={ui.selectedProviderId}
          conceptSaveMode={conceptSaveMode}
          artSaveMode={artSaveMode}
          artSaveFolder={ui.artSaveTargetFolder}
        />
      )}
    </div>
  );
}

function GenerationWorkspace({
  provider, selectedProviderId, conceptSaveMode, artSaveMode, artSaveFolder,
}) {
  const rootRef = useRef(null);
  const [navW, setNavW] = useState(168);
  const [settingsW, setSettingsW] = useState(290);

  /** Grow/shrink Results by adjusting Settings (Results is the remaining 1fr). */
  const resizeResultsBy = useCallback((deltaFromResultsEdge) => {
    // Dragging the results handle right → shrink results → grow settings.
    // Dragging left → grow results → shrink settings.
    setSettingsW((w) => {
      const root = rootRef.current;
      const total = root?.clientWidth || 1200;
      const splitter = 16;
      const maxSettings = Math.min(
        SETTINGS_MAX,
        Math.max(SETTINGS_MIN, total - navW - splitter - RESULTS_MIN),
      );
      return clamp(w + deltaFromResultsEdge, SETTINGS_MIN, maxSettings);
    });
  }, [navW]);

  return (
    <div
      ref={rootRef}
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
          {artSaveMode && (
            <span className="bb-ai-assets__badge" title={artSaveFolder || '/'}>
              Project Art save
            </span>
          )}
          {!artSaveMode && conceptSaveMode && (
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
        ariaLabel="Resize result preview column"
        title="Drag to resize Result Preview"
        onDelta={resizeResultsBy}
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

function ColumnResizeHandle({ onDelta, ariaLabel, title }) {
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
      title={title || ariaLabel}
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
