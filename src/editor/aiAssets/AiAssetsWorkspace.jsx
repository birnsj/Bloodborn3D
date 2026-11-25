import { useEffect, useState } from 'react';
import { OpenArtControls } from '../openart/OpenArtControls.jsx';
import { OpenArtResults } from '../openart/OpenArtResults.jsx';
import {
  getAiAssetsUiState,
  subscribeAiAssetsUi,
} from './aiAssetsUiStore.js';
import { getAiProvider } from './providers.js';
import { ProviderNav } from './ProviderNav.jsx';

/**
 * Phase 2H.1C — AI Assets workspace.
 * Left: provider nav · Center: generation controls · Right: results / actions
 */
export function AiAssetsWorkspace() {
  const [ui, setUi] = useState(() => getAiAssetsUiState());
  useEffect(() => subscribeAiAssetsUi(setUi), []);

  const provider = getAiProvider(ui.selectedProviderId);

  return (
    <div className="bb-workspace bb-ai-assets" data-bb-tutorial="workspace.ai">
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
