import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useAppStore } from '@/stores/app';
import { useTerminalTabsStore } from '@/stores/terminal-tabs';
import { MobileKeyBar } from './MobileKeyBar';
import { BranchSelector } from './BranchSelector';
import { Plus, X, Edit2, GitBranch } from 'lucide-react';
import type { TerminalTab } from '@/types';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

interface ClaudeTerminalProps {
  showMobileKeyBar?: boolean;
}

export const ClaudeTerminal: React.FC<ClaudeTerminalProps> = ({ showMobileKeyBar = true }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [sessionState, setSessionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(14);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState('');
  const [showBranchSelector, setShowBranchSelector] = useState(false);

  const selectedRepo = useAppStore((state) => state.selectedRepo);
  const user = useAppStore((state) => state.user);
  const setSessionManagerOpen = useAppStore((state) => state.setSessionManagerOpen);

  // Terminal tabs state
  const {
    tabs,
    activeTabId,
    loadTabs,
    createTab,
    closeTab,
    renameTab,
    setActiveTab,
    updateTabState,
    error: storeError,
    errorCode,
    clearError,
  } = useTerminalTabsStore();

  const repoId = selectedRepo?.repoId;

  // Get active tab info
  const activeTab = tabs.find(t => t.id === activeTabId);

  // Load tabs when repo changes, create initial tab if none exist
  useEffect(() => {
    const initTabs = async () => {
      if (repoId) {
        await loadTabs(repoId);
      }
    };
    initTabs();
  }, [repoId, loadTabs]);

  // Show branch selector for initial session instead of auto-creating
  useEffect(() => {
    const promptForBranch = () => {
      if (repoId && tabs.length === 0 && !activeTabId && !showBranchSelector) {
        console.log('[ClaudeTerminal] Prompting for branch selection');
        setShowBranchSelector(true);
      }
    };
    promptForBranch();
  }, [repoId, tabs.length, activeTabId, showBranchSelector]);

  // Debug logging for connection state
  useEffect(() => {
    console.log('[ClaudeTerminal] Connection state:', { repoId, userEmail: user?.email, activeTabId, sessionState, tabsCount: tabs.length });
  }, [repoId, user?.email, activeTabId, sessionState, tabs.length]);

  // Refit terminal when tabs change (tab bar appears/disappears)
  useEffect(() => {
    if (fitAddon.current && terminalInstance.current) {
      // Small delay to let the DOM update
      setTimeout(() => {
        fitAddon.current?.fit();
      }, 50);
    }
  }, [tabs.length]);

  // Initialize terminal on mount
  useEffect(() => {
    if (!terminalRef.current || terminalInstance.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: fontSize,
      // Use a more reliable monospace font stack
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Source Code Pro", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a2e',
        foreground: '#eee',
        cursor: '#00d9ff',
        selectionBackground: '#4a4a6a',
      },
      scrollback: 10000,
    });

    const fit = new FitAddon();
    const webLinks = new WebLinksAddon();

    term.loadAddon(fit);
    term.loadAddon(webLinks);
    term.open(terminalRef.current);

    terminalInstance.current = term;
    fitAddon.current = fit;

    // Handle window resize with debounce
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (fitAddon.current && terminalInstance.current) {
          fitAddon.current.fit();
        }
      }, 100);
    };
    window.addEventListener('resize', handleResize);

    // Use ResizeObserver to detect container size changes
    let resizeDebounceTimer: ReturnType<typeof setTimeout>;
    const resizeObserver = new ResizeObserver((entries) => {
      // Debounce resize to avoid excessive fits
      clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = setTimeout(() => {
        if (fitAddon.current && terminalInstance.current) {
          const entry = entries[0];
          if (entry) {
            const { width, height } = entry.contentRect;
            // Only fit if we have a valid size
            if (width > 0 && height > 0) {
              fitAddon.current.fit();
            }
          }
        }
      }, 100);
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    // Initial fit with multiple delays to ensure container is fully rendered
    const doFit = () => {
      if (fitAddon.current && terminalInstance.current) {
        fitAddon.current.fit();
      }
    };

    // Wait for fonts to load before fitting to ensure correct character measurements
    if (document.fonts) {
      document.fonts.ready.then(() => {
        requestAnimationFrame(() => {
          doFit();
          setTimeout(doFit, 100);
        });
      });
    } else {
      // Fallback for browsers without document.fonts
      requestAnimationFrame(() => {
        doFit();
        setTimeout(doFit, 100);
        setTimeout(doFit, 500);
      });
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
      clearTimeout(resizeDebounceTimer);
      resizeObserver.disconnect();
      term.dispose();
      terminalInstance.current = null;
      fitAddon.current = null;
    };
  }, []);

  // Update font size when changed
  useEffect(() => {
    if (terminalInstance.current) {
      terminalInstance.current.options.fontSize = fontSize;
      if (fitAddon.current) {
        fitAddon.current.fit();
      }
    }
  }, [fontSize]);

  // Connect to WebSocket when active tab changes
  useEffect(() => {
    if (!repoId || !user?.email || !activeTabId) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const term = terminalInstance.current;
    if (!term) return;

    setSessionState('connecting');
    setError(null);
    // Clear and reset terminal properly
    term.clear();
    term.reset();
    // Refit to ensure correct dimensions
    if (fitAddon.current) {
      fitAddon.current.fit();
    }
    term.writeln('\x1b[33m⏳ Connecting to Claude session...\x1b[0m');

    // Build WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/claude?repoId=${encodeURIComponent(repoId)}&devEmail=${encodeURIComponent(user.email)}`;

    console.log('[ClaudeTerminal] Connecting to WebSocket:', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[ClaudeTerminal] WebSocket connected');
      // Refit to get correct dimensions before attaching
      if (fitAddon.current) {
        fitAddon.current.fit();
      }
      // Send attach message with sessionId and branch
      const dims = { cols: term.cols, rows: term.rows };
      const activeTab = tabs.find(t => t.id === activeTabId);
      const branch = activeTab?.branch;
      console.log('[ClaudeTerminal] Attaching to session:', activeTabId, 'dims:', dims, 'branch:', branch);
      ws.send(JSON.stringify({ type: 'attach', sessionId: activeTabId, ...dims, branch }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output' && msg.data) {
          term.write(msg.data);
        } else if (msg.type === 'replay' && msg.data) {
          term.write(msg.data);
        } else if (msg.type === 'status') {
          if (msg.state === 'running') {
            setSessionState('connected');
            updateTabState(activeTabId, 'running');
          }
          // Update tab name if provided
          if (msg.sessionName) {
            // Tab name might have changed on server
          }
        } else if (msg.type === 'exit') {
          term.writeln('\n\x1b[33m⚠ Claude session ended\x1b[0m');
          setSessionState('disconnected');
          updateTabState(activeTabId, 'exited');
        } else if (msg.type === 'error') {
          term.writeln(`\n\x1b[31m✗ Error: ${msg.message}\x1b[0m`);
          setError(msg.message);
        } else if (msg.type === 'pong') {
          // Keep-alive response
        }
      } catch {
        term.write(event.data);
      }
    };

    ws.onerror = (err) => {
      console.error('[ClaudeTerminal] WebSocket error:', err);
      term.writeln('\n\x1b[31m✗ WebSocket connection error. Check that the server is running.\x1b[0m');
      setError('Connection error - server may be down');
      setSessionState('disconnected');
    };

    ws.onclose = (event) => {
      console.log('[ClaudeTerminal] WebSocket closed:', event.code, event.reason);
      if (sessionState !== 'disconnected') {
        setSessionState('disconnected');
        term.writeln('\n\x1b[33m⚠ Disconnected from Claude\x1b[0m');
      }
      wsRef.current = null;
    };

    // Handle terminal input
    const inputDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Handle terminal resize
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    return () => {
      inputDisposable.dispose();
      resizeDisposable.dispose();
      ws.close();
    };
  }, [repoId, user?.email, activeTabId]);

  // Handle new tab creation - show branch selector first
  const handleNewTab = () => {
    if (!repoId) {
      console.error('[ClaudeTerminal] Cannot create tab: no repoId');
      return;
    }
    console.log('[ClaudeTerminal] Opening branch selector for new tab');
    setShowBranchSelector(true);
  };

  // Handle branch selection
  const handleBranchSelect = async (branch: string) => {
    if (!repoId) return;

    console.log('[ClaudeTerminal] Creating new tab for repo:', repoId, 'branch:', branch);
    try {
      const tab = await createTab(repoId, undefined, branch);
      if (tab) {
        console.log('[ClaudeTerminal] Tab created successfully:', tab.id);
      } else {
        console.error('[ClaudeTerminal] Failed to create tab - no tab returned');
        setError('Failed to create new session');
      }
    } catch (err) {
      console.error('[ClaudeTerminal] Error creating tab:', err);
      setError('Error creating new session');
    }
  };

  // Handle tab close
  const handleCloseTab = async (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    await closeTab(tabId);
  };

  // Handle tab rename
  const handleStartRename = (e: React.MouseEvent, tab: TerminalTab) => {
    e.stopPropagation();
    setEditingTabId(tab.id);
    setEditingTabName(tab.name);
  };

  const handleFinishRename = async () => {
    if (editingTabId && editingTabName.trim()) {
      await renameTab(editingTabId, editingTabName.trim());
    }
    setEditingTabId(null);
    setEditingTabName('');
  };

  const handleKeyPressRename = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFinishRename();
    } else if (e.key === 'Escape') {
      setEditingTabId(null);
      setEditingTabName('');
    }
  };

  // Handle key press from MobileKeyBar
  const handleKeyPress = useCallback((key: string) => {
    if (terminalInstance.current && wsRef.current?.readyState === WebSocket.OPEN) {
      terminalInstance.current.paste(key);
    }
  }, []);

  // Handle font size change from MobileKeyBar
  const handleFontSizeChange = useCallback((delta: number) => {
    setFontSize(prev => Math.max(10, Math.min(24, prev + delta)));
  }, []);

  return (
    <div className="claude-terminal">
      {/* Tab Bar */}
      {tabs.length > 0 && (
        <div className="terminal-tabs">
          <div className="terminal-tabs-list">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`terminal-tab ${tab.id === activeTabId ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {editingTabId === tab.id ? (
                  <input
                    type="text"
                    value={editingTabName}
                    onChange={(e) => setEditingTabName(e.target.value)}
                    onBlur={handleFinishRename}
                    onKeyDown={handleKeyPressRename}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                    className="terminal-tab-input"
                  />
                ) : (
                  <>
                    <span className="terminal-tab-name" title={`${tab.name}${tab.branch ? ` (${tab.branch})` : ''}`}>
                      {tab.name}
                      {tab.branch && (
                        <span className="terminal-tab-branch">
                          <GitBranch className="w-3 h-3 inline ml-1" />
                          {tab.branch}
                        </span>
                      )}
                    </span>
                    <div className="terminal-tab-actions">
                      <button
                        className="terminal-tab-btn"
                        onClick={(e) => handleStartRename(e, tab)}
                        title="Rename"
                      >
                        <Edit2 size={12} />
                      </button>
                      {tabs.length > 1 && (
                        <button
                          className="terminal-tab-btn"
                          onClick={(e) => handleCloseTab(e, tab.id)}
                          title="Close"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <button
            className="terminal-tab-new"
            onClick={handleNewTab}
            title="New Session"
          >
            <Plus size={16} />
          </button>
        </div>
      )}

      <div className="terminal-header">
        <div className="terminal-title">
          <span className="terminal-icon">🤖</span>
          <span>Claude Terminal</span>
          {selectedRepo && (
            <span className="repo-badge">{selectedRepo.name}</span>
          )}
          {activeTab?.branch && (
            <span className="branch-badge" title={`Branch: ${activeTab.branch}`}>
              <GitBranch className="w-3 h-3 inline mr-1" />
              {activeTab.branch}
            </span>
          )}
        </div>
        <div className="terminal-controls">
          <span className={`status-indicator ${sessionState}`}>
            {sessionState === 'connected' && '🟢 Connected'}
            {sessionState === 'connecting' && '🟡 Connecting...'}
            {sessionState === 'disconnected' && '🔴 Disconnected'}
          </span>
        </div>
      </div>

      {/* Show storeError (API errors like max sessions) with priority over local error (WebSocket errors) */}
      {(storeError || error) && (
        <div className={`terminal-error ${errorCode === 'MAX_SESSIONS' ? 'is-actionable' : ''}`}>
          <div className="terminal-error-content">
            <span>⚠️ {storeError || error}</span>
            {errorCode === 'MAX_SESSIONS' && (
              <button
                className="terminal-error-action"
                onClick={() => setSessionManagerOpen(true)}
              >
                Manage Sessions
              </button>
            )}
          </div>
          {(storeError || error) && (
            <button
              className="terminal-error-close"
              onClick={() => {
                setError(null);
                clearError();
              }}
              title="Dismiss"
            >
              ×
            </button>
          )}
        </div>
      )}

      <div
        ref={terminalRef}
        className="terminal-container"
      />

      {/* Mobile Key Bar */}
      {showMobileKeyBar && (
        <MobileKeyBar
          onKeyPress={handleKeyPress}
          onFontSizeChange={handleFontSizeChange}
        />
      )}

      {/* Branch Selector Modal */}
      <BranchSelector
        repoId={repoId || ''}
        isOpen={showBranchSelector}
        onClose={() => setShowBranchSelector(false)}
        onSelect={handleBranchSelect}
      />
    </div>
  );
};
