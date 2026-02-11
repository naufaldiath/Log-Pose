import { useState, useEffect, useCallback } from 'react';
import { X, Trash2, Monitor, AlertCircle } from 'lucide-react';
import { getAllUserSessions, deleteSession, type ApiError } from '@/api';
import { useTerminalTabsStore } from '@/stores/terminal-tabs';
import type { UserSession } from '@/types';

interface SessionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SessionManagerModal({ isOpen, onClose }: SessionManagerModalProps) {
  const { loadTabs, tabs, closeTab } = useTerminalTabsStore();
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { sessions } = await getAllUserSessions();
      // Sort by creation date, newest first
      const sorted = sessions.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setSessions(sorted);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen, loadSessions]);

  const handleDelete = async (sessionId: string, repoId: string) => {
    setDeletingId(sessionId);
    try {
      await deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));

      // If the deleted session is in the current repo's tabs, remove it from the store
      const tabToClose = tabs.find(t => t.id === sessionId);
      if (tabToClose) {
        // Use closeTab from the store to properly handle active tab switching
        await closeTab(sessionId);
      }

      // Refresh tabs for the repo if we deleted a session from it
      await loadTabs(repoId);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to delete session');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStateColor = (state: UserSession['state']) => {
    switch (state) {
      case 'running':
        return 'text-teal-400';
      case 'starting':
        return 'text-yellow-400';
      case 'exited':
        return 'text-slate-400';
      default:
        return 'text-slate-400';
    }
  };

  const getStateLabel = (state: UserSession['state']) => {
    switch (state) {
      case 'running':
        return 'Active';
      case 'starting':
        return 'Starting';
      case 'exited':
        return 'Exited';
      default:
        return state;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 bg-midnight-800 rounded-lg shadow-2xl border border-midnight-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-midnight-700">
          <div className="flex items-center gap-3">
            <Monitor className="w-5 h-5 text-brass-400" />
            <h2 className="text-lg font-semibold text-midnight-100">
              Manage Sessions
            </h2>
            <span className="px-2 py-0.5 text-xs rounded-full bg-midnight-700 text-midnight-300">
              {sessions.length} total
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-midnight-400 hover:text-midnight-100 hover:bg-midnight-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-midnight-600 border-t-brass-400 rounded-full animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12">
              <Monitor className="w-12 h-12 text-midnight-600 mx-auto mb-3" />
              <p className="text-midnight-400">No active sessions</p>
              <p className="text-sm text-midnight-500 mt-1">
                Create a new session to get started
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {sessions.map(session => (
                <div
                  key={session.id}
                  className="flex items-center gap-4 p-4 rounded-lg bg-midnight-900/50 border border-midnight-700/50 hover:border-midnight-600 transition-colors"
                >
                  {/* Session Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-midnight-100 truncate">
                        {session.name}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full bg-midnight-800 ${getStateColor(
                          session.state
                        )}`}
                      >
                        {getStateLabel(session.state)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-midnight-400">
                      <span className="truncate">{session.repoName}</span>
                      <span className="text-midnight-600">•</span>
                      <span>{formatDate(session.createdAt)}</span>
                    </div>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDelete(session.id, session.repoId)}
                    disabled={deletingId === session.id}
                    className="p-2 rounded-md text-midnight-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Delete session"
                  >
                    {deletingId === session.id ? (
                      <div className="w-5 h-5 border-2 border-midnight-600 border-t-red-400 rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="w-5 h-5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-midnight-700 bg-midnight-900/30 rounded-b-lg">
          <p className="text-sm text-midnight-400">
            Sessions are automatically cleaned up after being disconnected for 20 minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
