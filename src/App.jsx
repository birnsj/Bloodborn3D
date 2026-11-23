import { EditorProvider } from './editor/EditorContext.jsx';
import { LayoutProvider } from './editor/layout/LayoutContext.jsx';
import { AssetBrowserProvider } from './editor/assets/AssetBrowserContext.jsx';
import { HoverHelpProvider } from './ui/hoverHelp/HoverHelpContext.jsx';
import { EditorDialogProvider } from './ui/dialogs/EditorDialogContext.jsx';
import { TutorialProvider } from './tutorials/TutorialProvider.jsx';
import { EditorShell } from './editor/layout/EditorShell.jsx';

export default function App() {
  return (
    <EditorDialogProvider>
      <AssetBrowserProvider>
        <EditorProvider>
          <LayoutProvider>
            <HoverHelpProvider>
              <TutorialProvider>
                <EditorShell />
              </TutorialProvider>
            </HoverHelpProvider>
          </LayoutProvider>
        </EditorProvider>
      </AssetBrowserProvider>
    </EditorDialogProvider>
  );
}
