import { create } from 'zustand';
import type { TerminalTab, SessionState } from '@/types';
import * as api from '@/api';
import { ApiError } from '@/api';

interface TerminalTabsState {
  // Tabs
  tabs: TerminalTab[];
  activeTabId: string | null;

  // Loading states
  isLoading: boolean;
  error: string | null;
  errorCode: string | null;

  // Actions
  loadTabs: (repoId: string) => Promise<void>;
  createTab: (repoId: string, name?: string) => Promise<TerminalTab | null>;
  closeTab: (sessionId: string) => Promise<void>;
  renameTab: (sessionId: string, name: string) => Promise<void>;
  setActiveTab: (sessionId: string) => void;
  updateTabState: (sessionId: string, state: SessionState) => void;
  clearError: () => void;

  // Getters
  getActiveTab: () => TerminalTab | null;
}

export const useTerminalTabsStore = create<TerminalTabsState>((set, get) => ({
  // Initial state
  tabs: [],
  activeTabId: null,
  isLoading: false,
  error: null,
  errorCode: null,

  // Actions
  loadTabs: async (repoId: string) => {
    set({ isLoading: true, error: null, errorCode: null, activeTabId: null });
    try {
      const { tabs } = await api.getSessions(repoId);
      set({ tabs, isLoading: false });

      // If tabs exist, set first as active
      if (tabs.length > 0) {
        set({ activeTabId: tabs[0].id });
      }
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  createTab: async (repoId: string, name?: string) => {
    set({ isLoading: true, error: null, errorCode: null });
    try {
      console.log('[terminal-tabs] Creating session for repo:', repoId);
      const tab = await api.createSession(repoId, name);
      console.log('[terminal-tabs] Session created:', tab.id);
      const { tabs } = get();
      set({
        tabs: [...tabs, tab],
        activeTabId: tab.id,
        isLoading: false,
      });
      return tab;
    } catch (error: any) {
      console.error('[terminal-tabs] Failed to create session:', error);
      // Handle specific error codes with user-friendly messages
      if (error instanceof ApiError && error.status === 429) {
        set({
          error: `Session limit reached: ${error.message}. Click the settings icon in the top bar to manage your sessions.`,
          errorCode: 'MAX_SESSIONS',
          isLoading: false,
        });
      } else if (error instanceof ApiError && error.status === 503) {
        set({
          error: `Server is at maximum capacity. Please try again later.`,
          errorCode: 'SERVER_BUSY',
          isLoading: false,
        });
      } else {
        set({ error: error.message, isLoading: false });
      }
      return null;
    }
  },

  clearError: () => {
    set({ error: null, errorCode: null });
  },

  closeTab: async (sessionId: string) => {
    const { tabs, activeTabId } = get();

    // Don't close if it's the last tab
    if (tabs.length <= 1) {
      return;
    }

    try {
      await api.deleteSession(sessionId);
      const newTabs = tabs.filter(t => t.id !== sessionId);

      // Update active tab if we closed the active one
      let newActiveId = activeTabId;
      if (activeTabId === sessionId) {
        const closedIndex = tabs.findIndex(t => t.id === sessionId);
        const newIndex = Math.max(0, closedIndex - 1);
        newActiveId = newTabs[newIndex]?.id || null;
      }

      set({ tabs: newTabs, activeTabId: newActiveId });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  renameTab: async (sessionId: string, name: string) => {
    try {
      await api.renameSession(sessionId, name);
      const { tabs } = get();
      const newTabs = tabs.map(t =>
        t.id === sessionId ? { ...t, name } : t
      );
      set({ tabs: newTabs });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  setActiveTab: (sessionId: string) => {
    set({ activeTabId: sessionId });
  },

  updateTabState: (sessionId: string, state: SessionState) => {
    const { tabs } = get();
    const newTabs = tabs.map(t =>
      t.id === sessionId ? { ...t, state } : t
    );
    set({ tabs: newTabs });
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find(t => t.id === activeTabId) || null;
  },
}));
