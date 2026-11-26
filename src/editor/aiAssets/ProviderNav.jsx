import { useEffect, useState } from 'react';
import { IconGrid, IconMesh } from '../../ui/icons.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { getOpenArtUiState, subscribeOpenArtUi } from '../openart/openArtUiStore.js';
import { AI_PROVIDER_CATEGORIES } from './providers.js';
import { selectAiProvider } from './aiAssetsUiStore.js';

function CategoryIcon({ categoryId }) {
  if (categoryId === 'mesh') return <IconMesh />;
  return <IconGrid />;
}

function providerStatusLabel(provider, openArtUi) {
  if (provider.status === 'coming_soon') return 'Soon';
  if (provider.id === 'openart') {
    if (openArtUi.phase === 'connecting') return '…';
    if (openArtUi.status?.ok) return 'On';
    if (openArtUi.errorCode === 'CLI_MISSING') return 'CLI';
    if (openArtUi.errorCode === 'AUTH_FAILED') return 'Auth';
    if (openArtUi.phase === 'running' || openArtUi.phase === 'submitting') return 'Busy';
    if (openArtUi.phase === 'failed') return 'Err';
    return '—';
  }
  return '—';
}

function providerStatusClass(provider, openArtUi) {
  if (provider.status === 'coming_soon') return 'is-soon';
  if (provider.id === 'openart') {
    if (openArtUi.status?.ok) return 'is-ok';
    if (openArtUi.phase === 'connecting' || openArtUi.phase === 'running' || openArtUi.phase === 'submitting') {
      return 'is-busy';
    }
    return 'is-bad';
  }
  return '';
}

/**
 * Left column — providers grouped by category.
 */
export function ProviderNav({ selectedProviderId }) {
  const [openArtUi, setOpenArtUi] = useState(() => getOpenArtUiState());
  useEffect(() => subscribeOpenArtUi(setOpenArtUi), []);

  return (
    <div className="bb-ai-assets__nav-body">
      {AI_PROVIDER_CATEGORIES.map((category) => (
        <div key={category.id} className="bb-ai-assets__category">
          <div className="bb-ai-assets__category-label">
            <CategoryIcon categoryId={category.id} />
            <span>{category.label}</span>
          </div>
          <ul className="bb-ai-assets__provider-list">
            {category.providers.map((provider) => {
              const active = selectedProviderId === provider.id;
              const soon = provider.status === 'coming_soon';
              const status = providerStatusLabel(provider, openArtUi);
              const statusClass = providerStatusClass(provider, openArtUi);
              return (
                <li key={provider.id}>
                  <button
                    type="button"
                    className={`bb-ai-assets__provider${active ? ' is-active' : ''}${soon ? ' is-soon' : ''}`}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => selectAiProvider(provider.id)}
                    {...helpProps(soon ? 'ai.provider.soon' : 'ai.provider.openart')}
                  >
                    <span className="bb-ai-assets__provider-icon" aria-hidden>
                      {provider.id === 'meshy' ? <IconMesh /> : <IconGrid />}
                    </span>
                    <span className="bb-ai-assets__provider-meta">
                      <span className="bb-ai-assets__provider-name">{provider.name}</span>
                      <span className="bb-muted bb-ai-assets__provider-blurb">{provider.blurb}</span>
                    </span>
                    <span className={`bb-ai-assets__provider-status ${statusClass}`}>{status}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
