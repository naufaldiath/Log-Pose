import { create } from 'zustand';
import type { User, RepoInfo, FileEntry, OpenFile, SessionState } from '@/types';
import * as api from '@/api';

// Persistence helpers
const STORAGE_KEY = 'logpose-ui-state';

interface PersistedState {
  isSidebarOpen: boolean;
  expandedDirs: string[];
  openFiles: string[];
  activeFileIndex: number;
}

function loadPersistedState(): Partial<PersistedState> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

function savePersistedState(state: Partial<PersistedState>) {
  try {
    const current = loadPersistedState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...state }));
  } catch {
    // Ignore storage errors
  }
}

interface AppState {
  // User
  user: User | null;
  isLoading: boolean;
  error: string | null;

  // Repos
  repos: RepoInfo[];
  selectedRepo: RepoInfo | null;

  // File tree
  fileTree: Map<string, FileEntry[]>;
  expandedDirs: Set<string>;
  selectedPath: string | null;

  // Open files
  openFiles: OpenFile[];
  activeFileIndex: number;

  // Claude session
  sessionState: SessionState | null;

  // UI state
  isSidebarOpen: boolean;
  isSearchOpen: boolean;
  isMobile: boolean;

  // Actions
  loadUser: () => Promise<void>;
  loadRepos: () => Promise<void>;
  selectRepo: (repo: RepoInfo) => void;

  loadDirectory: (path: string) => Promise<void>;
  toggleDirectory: (path: string) => void;

  openFile: (path: string) => Promise<void>;
  closeFile: (index: number) => void;
  setActiveFile: (index: number) => void;
  updateFileContent: (index: number, content: string) => void;
  saveCurrentFile: () => Promise<void>;

  setSessionState: (state: SessionState | null) => void;

  toggleSidebar: () => void;
  setSearchOpen: (open: boolean) => void;
  setMobile: (isMobile: boolean) => void;
  setError: (error: string | null) => void;

  // Persistence
  restoreOpenFiles: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => {
  const persisted = loadPersistedState();

  return {
    // Initial state
    user: null,
    isLoading: true,
    error: null,

    repos: [],
    selectedRepo: null,

    fileTree: new Map(),
    expandedDirs: new Set(persisted.expandedDirs || []),
    selectedPath: null,

    openFiles: [],
    activeFileIndex: -1,

    sessionState: null,

    isSidebarOpen: persisted.isSidebarOpen ?? true,
    isSearchOpen: false,
    isMobile: false,

    // Actions
    loadUser: async () => {
      try {
        const user = await api.getMe();
        set({ user, isLoading: false });
      } catch (error: any) {
        set({ error: error.message, isLoading: false });
      }
    },

    loadRepos: async () => {
      try {
        const repos = await api.getRepos();
        set({ repos });
      } catch (error: any) {
        set({ error: error.message });
      }
    },

    selectRepo: (repo) => {
      set({
        selectedRepo: repo,
        fileTree: new Map(),
        expandedDirs: new Set(),
        selectedPath: null,
        openFiles: [],
        activeFileIndex: -1,
        sessionState: null,
      });
      // Clear persisted open files when switching repos
      savePersistedState({ openFiles: [], activeFileIndex: -1 });
      // Load root directory
      get().loadDirectory('');
    },

    loadDirectory: async (path) => {
      const { selectedRepo, fileTree } = get();
      if (!selectedRepo) return;

      try {
        const result = await api.getTree(selectedRepo.repoId, path);
        const newTree = new Map(fileTree);
        newTree.set(path || '.', result.entries);
        set({ fileTree: newTree });
      } catch (error: any) {
        set({ error: error.message });
      }
    },

    toggleDirectory: (path) => {
      const { expandedDirs, loadDirectory } = get();
      const newExpanded = new Set(expandedDirs);

      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
        loadDirectory(path);
      }

      set({ expandedDirs: newExpanded });

      // Persist expanded dirs
      savePersistedState({
        expandedDirs: Array.from(newExpanded),
      });
    },

    openFile: async (path) => {
      const { selectedRepo, openFiles } = get();
      if (!selectedRepo) return;

      // Check if already open
      const existingIndex = openFiles.findIndex(f => f.path === path);
      if (existingIndex >= 0) {
        set({ activeFileIndex: existingIndex, selectedPath: path });
        // Persist
        savePersistedState({
          openFiles: openFiles.map(f => f.path),
          activeFileIndex: existingIndex,
        });
        return;
      }

      try {
        const result = await api.getFile(selectedRepo.repoId, path);
        const language = getLanguageFromPath(path);

        const newFile: OpenFile = {
          path: result.path,
          content: result.content,
          isDirty: false,
          language,
        };

        const newFiles = [...openFiles, newFile];
        set({
          openFiles: newFiles,
          activeFileIndex: newFiles.length - 1,
          selectedPath: path,
        });

        // Persist
        savePersistedState({
          openFiles: newFiles.map(f => f.path),
          activeFileIndex: newFiles.length - 1,
        });
      } catch (error: any) {
        set({ error: error.message });
      }
    },

    closeFile: (index) => {
      const { openFiles, activeFileIndex } = get();
      const newFiles = openFiles.filter((_, i) => i !== index);

      let newActive = activeFileIndex;
      if (index <= activeFileIndex) {
        newActive = Math.max(0, activeFileIndex - 1);
      }
      if (newFiles.length === 0) {
        newActive = -1;
      }

      set({
        openFiles: newFiles,
        activeFileIndex: newActive,
        selectedPath: newFiles[newActive]?.path || null,
      });

      // Persist
      savePersistedState({
        openFiles: newFiles.map(f => f.path),
        activeFileIndex: newActive,
      });
    },

    setActiveFile: (index) => {
      const { openFiles } = get();
      if (index >= 0 && index < openFiles.length) {
        set({
          activeFileIndex: index,
          selectedPath: openFiles[index].path,
        });

        // Persist
        savePersistedState({
          activeFileIndex: index,
        });
      }
    },

    updateFileContent: (index, content) => {
      const { openFiles } = get();
      const newFiles = [...openFiles];
      if (newFiles[index]) {
        newFiles[index] = {
          ...newFiles[index],
          content,
          isDirty: true,
        };
        set({ openFiles: newFiles });
      }
    },

    saveCurrentFile: async () => {
      const { selectedRepo, openFiles, activeFileIndex } = get();
      if (!selectedRepo || activeFileIndex < 0) return;

      const file = openFiles[activeFileIndex];
      if (!file || !file.isDirty) return;

      try {
        await api.saveFile(selectedRepo.repoId, file.path, file.content);

        const newFiles = [...openFiles];
        newFiles[activeFileIndex] = {
          ...newFiles[activeFileIndex],
          isDirty: false,
        };
        set({ openFiles: newFiles });
      } catch (error: any) {
        set({ error: error.message });
      }
    },

    setSessionState: (state) => {
      set({ sessionState: state });
    },

    toggleSidebar: () => {
      set((state) => {
        const newValue = !state.isSidebarOpen;
        // Persist
        savePersistedState({ isSidebarOpen: newValue });
        return { isSidebarOpen: newValue };
      });
    },

    setSearchOpen: (open) => {
      set({ isSearchOpen: open });
    },

    setMobile: (isMobile) => {
      set({ isMobile, isSidebarOpen: !isMobile });
    },

    setError: (error) => {
      set({ error });
    },

    // Restore open files on app load (call after repos loaded)
    restoreOpenFiles: async () => {
      const { selectedRepo } = get();
      if (!selectedRepo) return;

      const persisted = loadPersistedState();
      if (persisted.openFiles && persisted.openFiles.length > 0) {
        // Open the first file to start
        const firstPath = persisted.openFiles[persisted.activeFileIndex || 0];
        if (firstPath) {
          await get().openFile(firstPath);
        }
      }
    },
  };
});

// Helper function to determine language from file extension
function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    md: 'markdown',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
  };
  return languageMap[ext || ''] || 'plaintext';
}
