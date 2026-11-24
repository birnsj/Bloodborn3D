import { IconFolder } from '../../ui/icons.jsx';
import { useLayout } from './LayoutContext.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';

/**
 * Content Browser — folder navigation only.
 * Assets for the selected folder appear in Asset Viewer.
 */
export function ContentBrowser({ docked = false } = {}) {
  const { layout, patch, ensurePanel } = useLayout();
  const { folders, queryAssets } = useAssetBrowser();

  const folder = layout.contentFolder || 'Materials';

  return (
    <section className={`bb-panel-chrome bb-content bb-content--nav${docked ? ' bb-panel-chrome--docked' : ''}`}>
      <div className="bb-panel-chrome__head">
        {!docked && <span className="bb-panel-chrome__title">Content Browser</span>}
        <span className="bb-muted bb-content__nav-hint">Folders</span>
      </div>

      <div className="bb-content__body bb-content__body--nav">
        <div className="bb-content__path">Content</div>
        <ul className="bb-content-folder-list">
          {folders.map((name) => {
            const count = queryAssets(name).length;
            const selected = folder === name;
            return (
              <li key={name}>
                <button
                  type="button"
                  className={`bb-content-folder${selected ? ' is-selected' : ''}`}
                  onClick={() => {
                    patch({ contentFolder: name });
                    ensurePanel?.('assetViewer');
                  }}
                  {...helpProps('content.folder')}
                >
                  <IconFolder />
                  <span className="bb-content-folder__name">{name}</span>
                  <span className="bb-content-folder__count">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
