import { useRef, useEffect, useState } from 'react';
import Editor, { OnChange, OnMount } from '@monaco-editor/react';
import { useAppStore } from '@/stores/app';
import { X, Circle, Settings, Type, WrapText, PanelTop, List, XCircle, MoreHorizontal } from 'lucide-react';

// Editor settings stored in localStorage
interface EditorSettings {
  fontSize: number;
  wordWrap: 'on' | 'off';
  minimap: boolean;
  lineNumbers: boolean;
}

const DEFAULT_SETTINGS: EditorSettings = {
  fontSize: 14,
  wordWrap: 'on',
  minimap: false,
  lineNumbers: true,
};

function loadSettings(): EditorSettings {
  try {
    const saved = localStorage.getItem('logpose-editor-settings');
    if (saved) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: EditorSettings) {
  localStorage.setItem('logpose-editor-settings', JSON.stringify(settings));
}

export function CodeEditor() {
  const editorRef = useRef<any>(null);
  const [settings, setSettings] = useState<EditorSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [tabMenuIndex, setTabMenuIndex] = useState<number | null>(null);

  const {
    openFiles,
    activeFileIndex,
    setActiveFile,
    closeFile,
    updateFileContent,
    saveCurrentFile,
  } = useAppStore();

  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;

  // Save settings when changed
  useEffect(() => {
    saveSettings(settings);
    // Update editor options if editor is mounted
    if (editorRef.current) {
      editorRef.current.updateOptions({
        fontSize: settings.fontSize,
        wordWrap: settings.wordWrap,
        minimap: { enabled: settings.minimap },
        lineNumbers: settings.lineNumbers ? 'on' : 'off',
      });
    }
  }, [settings]);

  // Handle editor mount
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Configure Monaco theme
    monaco.editor.defineTheme('midnight-brass', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6a7280' },
        { token: 'keyword', foreground: 'c084fc' },
        { token: 'string', foreground: '4ade80' },
        { token: 'number', foreground: 'f59e0b' },
        { token: 'type', foreground: '60a5fa' },
      ],
      colors: {
        'editor.background': '#1e1e22',
        'editor.foreground': '#f4f4f5',
        'editor.lineHighlightBackground': '#27272a',
        'editor.selectionBackground': '#134e4a80',
        'editorCursor.foreground': '#d6952f',
        'editorLineNumber.foreground': '#52525b',
        'editorLineNumber.activeForeground': '#a1a1aa',
      },
    });

    monaco.editor.setTheme('midnight-brass');

    // Add keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveCurrentFile();
    });
  };

  // Handle content change
  const handleChange: OnChange = (value) => {
    if (value !== undefined && activeFileIndex >= 0) {
      updateFileContent(activeFileIndex, value);
    }
  };

  // Handle Cmd/Ctrl+S globally
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentFile();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveCurrentFile]);

  // Close tab menu when clicking outside
  useEffect(() => {
    if (tabMenuIndex !== null) {
      const handleClick = () => setTabMenuIndex(null);
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [tabMenuIndex]);

  // Handle close all tabs
  const handleCloseAll = () => {
    for (let i = openFiles.length - 1; i >= 0; i--) {
      closeFile(i);
    }
    setTabMenuIndex(null);
  };

  // Handle close others
  const handleCloseOthers = (keepIndex: number) => {
    // Close tabs after keepIndex
    for (let i = openFiles.length - 1; i > keepIndex; i--) {
      closeFile(i);
    }
    // Close tabs before keepIndex
    for (let i = keepIndex - 1; i >= 0; i--) {
      closeFile(i);
    }
    setTabMenuIndex(null);
  };

  // Handle close to the right
  const handleCloseToRight = (fromIndex: number) => {
    for (let i = openFiles.length - 1; i > fromIndex; i--) {
      closeFile(i);
    }
    setTabMenuIndex(null);
  };

  if (openFiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-midnight-950 text-midnight-500">
        <div className="text-center">
          <p className="text-lg mb-2">No file open</p>
          <p className="text-sm">Select a file from the tree to edit</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-midnight-950">
      {/* Tab bar */}
      <div className="flex items-center bg-midnight-900 border-b border-midnight-700 overflow-x-auto">
        {openFiles.map((file, index) => (
          <div
            key={file.path}
            className={`tab flex items-center gap-2 ${index === activeFileIndex ? 'active' : ''}`}
            onClick={() => setActiveFile(index)}
            title={file.path}
          >
            <span className="truncate max-w-[150px]">
              {file.path.split('/').pop()}
            </span>

            {file.isDirty && (
              <Circle size={8} className="fill-brass-500 text-brass-500" />
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                closeFile(index);
              }}
              className="p-0.5 hover:bg-midnight-700 rounded opacity-50 hover:opacity-100 transition-opacity"
            >
              <X size={12} />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setTabMenuIndex(tabMenuIndex === index ? null : index);
              }}
              className="p-0.5 hover:bg-midnight-700 rounded opacity-50 hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal size={12} />
            </button>

            {/* Tab context menu */}
            {tabMenuIndex === index && (
              <div
                className="context-menu"
                style={{ top: '100%', right: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="context-menu-item"
                  onClick={() => {
                    handleCloseOthers(index);
                  }}
                >
                  <XCircle size={14} />
                  Close Others
                </button>
                <button
                  className="context-menu-item"
                  onClick={() => handleCloseToRight(index)}
                >
                  <PanelTop size={14} />
                  Close to the Right
                </button>
                <div className="context-menu-separator" />
                <button
                  className="context-menu-item"
                  onClick={handleCloseAll}
                >
                  <XCircle size={14} />
                  Close All
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Settings button */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 mx-2 rounded transition-colors ${showSettings ? 'bg-brass-600 text-white' : 'text-midnight-400 hover:text-midnight-200 hover:bg-midnight-800'}`}
          title="Editor Settings"
        >
          <Settings size={16} />
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="px-4 py-3 bg-midnight-800 border-b border-midnight-700">
          <div className="flex flex-wrap items-center gap-6">
            {/* Font size */}
            <div className="flex items-center gap-3">
              <Type size={16} className="text-midnight-400" />
              <span className="text-sm text-midnight-300">Font Size:</span>
              <input
                type="range"
                min={10}
                max={24}
                value={settings.fontSize}
                onChange={(e) => setSettings({ ...settings, fontSize: parseInt(e.target.value) })}
                className="w-24 accent-brass-500"
              />
              <span className="text-sm text-midnight-400 w-6">{settings.fontSize}</span>
            </div>

            {/* Word wrap */}
            <label className="flex items-center gap-2 text-sm text-midnight-300 cursor-pointer">
              <WrapText size={16} className="text-midnight-400" />
              <input
                type="checkbox"
                checked={settings.wordWrap === 'on'}
                onChange={(e) => setSettings({ ...settings, wordWrap: e.target.checked ? 'on' : 'off' })}
                className="rounded border-midnight-600 bg-midnight-700 text-brass-500 focus:ring-brass-500"
              />
              Word Wrap
            </label>

            {/* Minimap */}
            <label className="flex items-center gap-2 text-sm text-midnight-300 cursor-pointer">
              <PanelTop size={16} className="text-midnight-400" />
              <input
                type="checkbox"
                checked={settings.minimap}
                onChange={(e) => setSettings({ ...settings, minimap: e.target.checked })}
                className="rounded border-midnight-600 bg-midnight-700 text-brass-500 focus:ring-brass-500"
              />
              Minimap
            </label>

            {/* Line numbers */}
            <label className="flex items-center gap-2 text-sm text-midnight-300 cursor-pointer">
              <List size={16} className="text-midnight-400" />
              <input
                type="checkbox"
                checked={settings.lineNumbers}
                onChange={(e) => setSettings({ ...settings, lineNumbers: e.target.checked })}
                className="rounded border-midnight-600 bg-midnight-700 text-brass-500 focus:ring-brass-500"
              />
              Line Numbers
            </label>
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1">
        {activeFile && (
          <Editor
            height="100%"
            language={activeFile.language}
            value={activeFile.content}
            onChange={handleChange}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: settings.minimap },
              fontSize: settings.fontSize,
              fontFamily: 'JetBrains Mono, Fira Code, Monaco, Consolas, monospace',
              lineHeight: 1.6,
              padding: { top: 16 },
              scrollBeyondLastLine: false,
              renderLineHighlight: 'line',
              cursorBlinking: 'smooth',
              smoothScrolling: true,
              tabSize: 2,
              wordWrap: settings.wordWrap,
              automaticLayout: true,
              lineNumbers: settings.lineNumbers ? 'on' : 'off',
            }}
            theme="midnight-brass"
          />
        )}
      </div>
    </div>
  );
}
