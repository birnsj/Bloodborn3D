import { useEffect, useState } from 'react';
import { IconGrid, IconMesh } from '../../ui/icons.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { getOpenArtUiState, subscribeOpenArtUi } from '../openart/openArtUiStore.js';
import { getMeshyUiState, subscribeMeshyUi } from '../meshy/meshyUiStore.js';
import { AI_PROVIDER_CATEGORIES } from './providers.js';
import { selectAiProvider } from './aiAssetsUiStore.js';

function CategoryIcon({ categoryId }) {
  if (categoryId === 'mesh') return <IconMesh />;
  return <IconGrid />;
}

function providerStatusLabel(provider, openArtUi, meshyUi) {
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
  if (provider.id === 'meshy') {
    if (meshyUi.phase === 'connecting') return '…';
    if (meshyUi.status?.ok) return 'On';
    if (meshyUi.errorCode === 'CLI_MISSING' || meshyUi.status?.code === 'CLI_MISSING') return 'CLI';
    if (meshyUi.errorCode === 'AUTH_FAILED' || meshyUi.status?.code === 'AUTH_FAILED') return 'Auth';
    if (meshyUi.phase === 'running' || meshyUi.phase === 'submitting') return 'Busy';
    if (meshyUi.phase === 'failed') return 'Err';
    return '—';
  }
  return '—';
}

function providerStatusClass(provider, openArtUi, meshyUi) {
  if (provider.status === 'coming_soon') return 'is-soon';
  if (provider.id === 'openart') {
    if (openArtUi.status?.ok) return 'is-ok';
    if (openArtUi.phase === 'connecting' || openArtUi.phase === 'running' || openArtUi.phase === 'submitting') {
      return 'is-busy';
    }
    return 'is-bad';
  }
  if (provider.id === 'meshy') {
    if (meshyUi.status?.ok) return 'is-ok';
    if (meshyUi.phase === 'connecting' || meshyUi.phase === 'running' || meshyUi.phase === 'submitting') {
      return 'is-busy';
    }
    return 'is-bad';
  }
  return '';
}

function providerHelpId(provider) {
  if (provider.status === 'coming_soon') return 'ai.provider.soon';
  if (provider.id === 'meshy') return 'ai.provider.meshy';
  return 'ai.provider.openart';
}

/**
 * Left column — providers grouped by category.
 */
export function ProviderNav({ selectedProviderId }) {
  const [openArtUi, setOpenArtUi] = useState(() => getOpenArtUiState());
  const [meshyUi, setMeshyUi] = useState(() => getMeshyUiState());
  useEffect(() => subscribeOpenArtUi(setOpenArtUi), []);
  useEffect(() => subscribeMeshyUi(setMeshyUi), []);

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
              const status = providerStatusLabel(provider, openArtUi, meshyUi);
              const statusClass = providerStatusClass(provider, openArtUi, meshyUi);
              return (
                <li key={provider.id}>
                  <button
                    type="button"
                    className={`bb-ai-assets__provider${active ? ' is-active' : ''}${soon ? ' is-soon' : ''}`}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => selectAiProvider(provider.id)}
                    {...helpProps(providerHelpId(provider))}
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
