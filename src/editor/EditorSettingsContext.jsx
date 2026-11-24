import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  clampEditorSettings,
  loadEditorSettings,
  loadUserDefaultSettings,
  saveEditorSettings,
  saveUserDefaultSettings,
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

  // Toolbar / View menu grid changes arrive here so Settings stays current.
  useEffect(() => {
    const onPatch = (e) => {
      const partial = e?.detail;
      if (!partial || typeof partial !== 'object') return;
      patchSettings(partial);
    };
    window.addEventListener('bb:editor-settings-patch', onPatch);
    return () => window.removeEventListener('bb:editor-settings-patch', onPatch);
  }, [patchSettings]);

  const resetSettings = useCallback(() => {
    const next = loadUserDefaultSettings();
    saveEditorSettings(next);
    setSettings(next);
    return next;
  }, []);

  const saveSettingsAsDefault = useCallback((override = null) => {
    setSettings((prev) => {
      const base = override
        ? clampEditorSettings({ ...prev, ...override })
        : prev;
      const next = saveUserDefaultSettings(base);
      saveEditorSettings(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      settings,
      patchSettings,
      resetSettings,
      saveSettingsAsDefault,
    }),
    [settings, patchSettings, resetSettings, saveSettingsAsDefault],
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
