import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  clampEditorSettings,
  DEFAULT_EDITOR_SETTINGS,
  loadEditorSettings,
  saveEditorSettings,
} from './editorSettingsPrefs.js';

const EditorSettingsContext = createContext(null);

export function EditorSettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => loadEditorSettings());

  const patchSettings = useCallback((partial) => {
    setSettings((prev) => {
      const next = clampEditorSettings({ ...prev, ...partial });
      saveEditorSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    const next = { ...DEFAULT_EDITOR_SETTINGS };
    saveEditorSettings(next);
    setSettings(next);
  }, []);

  const value = useMemo(
    () => ({
      settings,
      patchSettings,
      resetSettings,
    }),
    [settings, patchSettings, resetSettings],
  );

  return (
    <EditorSettingsContext.Provider value={value}>
      {children}
    </EditorSettingsContext.Provider>
  );
}

export function useEditorSettings() {
  const ctx = useContext(EditorSettingsContext);
  if (!ctx) {
    throw new Error('useEditorSettings must be used within EditorSettingsProvider');
  }
  return ctx;
}
