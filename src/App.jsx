import { EditorProvider } from './editor/EditorContext.jsx';
import { LayoutProvider } from './editor/layout/LayoutContext.jsx';
import { AssetBrowserProvider } from './editor/assets/AssetBrowserContext.jsx';
import { EditorShell } from './editor/layout/EditorShell.jsx';

export default function App() {
  return (
    <AssetBrowserProvider>
      <EditorProvider>
        <LayoutProvider>
          <EditorShell />
        </LayoutProvider>
      </EditorProvider>
    </AssetBrowserProvider>
  );
}
