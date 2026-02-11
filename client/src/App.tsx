import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/app';
import { RepoSelector } from '@/components/RepoSelector';
import { FileTree } from '@/components/FileTree';
import { CodeEditor } from '@/components/CodeEditor';
import { ClaudeTerminal } from '@/components/ClaudeTerminal';
import { SearchPanel } from '@/components/SearchPanel';
import { ResizablePanel } from '@/components/ResizablePanel';
import {
  Menu,
  Search,
  PanelLeftClose,
  PanelLeft,
  AlertCircle,
  X,
  Loader2,
  FileCode,
  Terminal,
  Keyboard
} from 'lucide-react';

function ErrorBanner() {
  const { error, setError } = useAppStore();

  if (!error) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-red-950 border-b border-red-800 text-red-200">
      <AlertCircle size={16} />
      <span className="flex-1 text-sm">{error}</span>
      <button onClick={() => setError(null)} className="p-1 hover:bg-red-900 rounded">
        <X size={14} />
      </button>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen bg-midnight-950">
      <div className="text-center">
        <Loader2 size={48} className="mx-auto mb-4 text-brass-500 animate-spin" />
        <p className="text-midnight-300">Loading...</p>
      </div>
    </div>
  );
}

function UnauthorizedScreen() {
  return (
    <div className="flex items-center justify-center h-screen bg-midnight-950">
      <div className="text-center max-w-md px-4">
        <AlertCircle size={64} className="mx-auto mb-6 text-red-500" />
        <h1 className="text-2xl font-bold text-midnight-100 mb-4">Access Denied</h1>
        <p className="text-midnight-400 mb-6">
          You don't have permission to access this application.
          Please contact your administrator if you believe this is an error.
        </p>
        <a
          href="/"
          className="btn btn-primary"
        >
          Try Again
        </a>
      </div>
    </div>
  );
}

function MainLayout() {
  const {
    user,
    isSidebarOpen,
    toggleSidebar,
    isMobile,
    setSearchOpen
  } = useAppStore();

  // Mobile panel toggle state
  const [mobileActivePanel, setMobileActivePanel] = useState<'editor' | 'terminal'>('editor');
  // Keybar toggle state - persist to localStorage
  const [showKeyBar, setShowKeyBar] = useState(() => {
    const saved = localStorage.getItem('logpose-keybar-visible');
    return saved ? JSON.parse(saved) : true; // Default to visible on mobile
  });

  // Save keybar state to localStorage
  const toggleKeyBar = () => {
    const newValue = !showKeyBar;
    setShowKeyBar(newValue);
    localStorage.setItem('logpose-keybar-visible', JSON.stringify(newValue));
  };

  // Detect mobile - run immediately and on resize
  useEffect(() => {
    const checkMobile = () => {
      const isMobileView = window.innerWidth < 768;
      useAppStore.getState().setMobile(isMobileView);
    };

    // Check immediately
    checkMobile();

    // Also check after a short delay to ensure correct detection
    const timeoutId = setTimeout(checkMobile, 100);

    window.addEventListener('resize', checkMobile);
    return () => {
      window.removeEventListener('resize', checkMobile);
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-midnight-950">
      {/* Error banner */}
      <ErrorBanner />

      {/* Top bar */}
      <header className="flex items-center gap-2 px-3 py-2 bg-midnight-900 border-b border-midnight-700">
        {/* Menu button (mobile) */}
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-midnight-800 rounded text-midnight-300 hover:text-midnight-100 lg:hidden"
        >
          <Menu size={20} />
        </button>

        {/* Sidebar toggle (desktop) */}
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-midnight-800 rounded text-midnight-300 hover:text-midnight-100 hidden lg:block"
          title={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
        </button>

        {/* Repo selector */}
        <div className="flex-shrink-0 min-w-0">
          <RepoSelector />
        </div>

        {/* Search button - hidden on very small screens */}
        <button
          onClick={() => setSearchOpen(true)}
          className="hidden sm:flex items-center gap-2 px-3 py-2 bg-midnight-800 hover:bg-midnight-700
                     border border-midnight-600 rounded text-sm text-midnight-400 hover:text-midnight-200"
        >
          <Search size={16} />
          <span className="hidden md:inline">Search</span>
          <kbd className="hidden lg:inline px-1.5 py-0.5 bg-midnight-700 rounded text-xs">
            ⌘P
          </kbd>
        </button>

        {/* Spacer */}
        <div className="flex-1 min-w-0" />

        {/* Mobile panel toggle - compact version */}
        {isMobile && (
          <div className="mobile-tab-toggle flex-shrink-0">
            <button
              onClick={() => setMobileActivePanel('editor')}
              className={`mobile-tab-btn ${mobileActivePanel === 'editor' ? 'active' : ''}`}
              title="Editor"
            >
              <FileCode size={16} />
              <span className="hidden xs:inline ml-1">Editor</span>
            </button>
            <button
              onClick={() => setMobileActivePanel('terminal')}
              className={`mobile-tab-btn ${mobileActivePanel === 'terminal' ? 'active' : ''}`}
              title="Terminal"
            >
              <Terminal size={16} />
              <span className="hidden xs:inline ml-1">Terminal</span>
            </button>
          </div>
        )}

        {/* Keybar toggle button - show on mobile or when in terminal panel */}
        {isMobile && mobileActivePanel === 'terminal' && (
          <button
            onClick={toggleKeyBar}
            className={`p-2 rounded transition-colors flex-shrink-0 ${
              showKeyBar
                ? 'bg-brass-600 text-white'
                : 'text-midnight-400 hover:text-midnight-200 hover:bg-midnight-800'
            }`}
            title={showKeyBar ? 'Hide keyboard' : 'Show keyboard'}
          >
            <Keyboard size={18} />
          </button>
        )}

        {/* User info - hidden on mobile */}
        <div className="text-sm text-midnight-400 hidden md:block truncate max-w-[150px]">
          {user?.email}
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar drawer (mobile) */}
        {isMobile && isSidebarOpen && (
          <>
            <div
              className="drawer-overlay"
              onClick={toggleSidebar}
            />
            <aside className="drawer">
              <FileTree />
            </aside>
          </>
        )}

        {/* Sidebar (desktop) */}
        {!isMobile && isSidebarOpen && (
          <aside className="w-64 flex-shrink-0 bg-midnight-900 border-r border-midnight-700">
            <FileTree />
          </aside>
        )}

        {/* Main panels */}
        <main className="flex-1 flex overflow-hidden">
          {isMobile ? (
            // Mobile: Tab-based switching between Editor and Terminal
            <div className="flex-1 w-full flex flex-col overflow-hidden">
              {mobileActivePanel === 'editor' ? (
                <CodeEditor />
              ) : (
                <ClaudeTerminal showMobileKeyBar={showKeyBar} />
              )}
            </div>
          ) : (
            // Desktop: Resizable panels
            <ResizablePanel
              leftPanel={<CodeEditor />}
              rightPanel={<ClaudeTerminal />}
              initialLeftWidth={50}
              minLeftWidth={300}
              minRightWidth={300}
              storageKey="logpose-panel-width"
            />
          )}
        </main>
      </div>

      {/* Search panel */}
      <SearchPanel />
    </div>
  );
}

export function App() {
  const { user, isLoading, error, loadUser, loadRepos } = useAppStore();

  // Load user and repos on mount
  useEffect(() => {
    loadUser().then(() => {
      loadRepos();
    });
  }, [loadUser, loadRepos]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user && error) {
    return <UnauthorizedScreen />;
  }

  return <MainLayout />;
}
