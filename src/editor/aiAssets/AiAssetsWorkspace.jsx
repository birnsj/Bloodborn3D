import { useEffect, useState } from 'react';
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
        <div className="bb-ai-assets">
          <aside className="bb-panel-chrome bb-ai-assets__nav">
            <div className="bb-panel-chrome__head">
              <span className="bb-panel-chrome__title">Providers</span>
            </div>
            <ProviderNav selectedProviderId={ui.selectedProviderId} />
          </aside>

          <section className="bb-panel-chrome bb-ai-assets__controls">
            <div className="bb-panel-chrome__head">
              <span className="bb-panel-chrome__title">
                {provider?.name || 'Generation'}
              </span>
              {provider?.status === 'coming_soon' && (
                <span className="bb-ai-assets__badge">Coming soon</span>
              )}
              {ui.conceptSaveTargetAreaId && (
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

          <section className="bb-panel-chrome bb-ai-assets__results">
            <div className="bb-panel-chrome__head">
              <span className="bb-panel-chrome__title">Results</span>
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
      )}
    </div>
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
