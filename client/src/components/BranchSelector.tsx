import React, { useState, useEffect, useCallback } from 'react';
import { GitBranch, Plus, X, Loader2 } from 'lucide-react';
import * as api from '@/api';

interface BranchSelectorProps {
  repoId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (branch: string) => void;
}

export const BranchSelector: React.FC<BranchSelectorProps> = ({
  repoId,
  isOpen,
  onClose,
  onSelect,
}) => {
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBranchName, setNewBranchName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadBranches = useCallback(async () => {
    if (!isOpen) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await api.getGitBranches(repoId);
      setBranches(result.all);
      setCurrentBranch(result.current);
    } catch (err: any) {
      setError(err.message || 'Failed to load branches');
    } finally {
      setIsLoading(false);
    }
  }, [repoId, isOpen]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const handleSelectBranch = async (branch: string) => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Checkout the branch (creates worktree)
      await api.checkoutBranch(repoId, branch, false);
      onSelect(branch);
      onClose();
    } catch (err: any) {
      setError(err.message || `Failed to checkout branch: ${branch}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateBranch = async () => {
    const trimmedName = newBranchName.trim();
    if (!trimmedName) return;

    // Validate branch name
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmedName)) {
      setError('Branch name can only contain letters, numbers, dots, hyphens, and underscores');
      return;
    }

    if (branches.includes(trimmedName)) {
      setError(`Branch '${trimmedName}' already exists`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Create new branch and worktree
      await api.checkoutBranch(repoId, trimmedName, true);
      onSelect(trimmedName);
      onClose();
      setNewBranchName('');
      setIsCreating(false);
    } catch (err: any) {
      setError(err.message || `Failed to create branch: ${trimmedName}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredBranches = branches.filter((b) =>
    b.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-midnight-800 rounded-lg shadow-xl w-full max-w-md border border-midnight-700">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-midnight-700">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-brass-400" />
            <h2 className="text-lg font-semibold text-midnight-100">
              Select Branch
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-midnight-700 rounded transition-colors"
            disabled={isSubmitting}
          >
            <X className="w-5 h-5 text-midnight-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-200 text-sm">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-brass-400" />
              <span className="ml-2 text-midnight-300">Loading branches...</span>
            </div>
          ) : (
            <>
              {/* Search */}
              {!isCreating && (
                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Search branches..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 bg-midnight-900 border border-midnight-600 rounded text-midnight-100 placeholder-midnight-500 focus:outline-none focus:border-brass-500"
                  />
                </div>
              )}

              {/* Create new branch form */}
              {isCreating ? (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-midnight-300 mb-2">
                    New Branch Name
                  </label>
                  <input
                    type="text"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateBranch();
                      if (e.key === 'Escape') {
                        setIsCreating(false);
                        setNewBranchName('');
                        setError(null);
                      }
                    }}
                    placeholder="feature/my-branch"
                    autoFocus
                    className="w-full px-3 py-2 bg-midnight-900 border border-midnight-600 rounded text-midnight-100 placeholder-midnight-500 focus:outline-none focus:border-brass-500"
                    disabled={isSubmitting}
                  />
                  <p className="mt-1 text-xs text-midnight-500">
                    Use letters, numbers, dots, hyphens, and underscores only
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={handleCreateBranch}
                      disabled={!newBranchName.trim() || isSubmitting}
                      className="flex-1 px-3 py-2 bg-brass-600 hover:bg-brass-500 disabled:bg-midnight-600 disabled:text-midnight-500 text-white rounded text-sm font-medium transition-colors"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Creating...
                        </span>
                      ) : (
                        'Create & Checkout'
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setIsCreating(false);
                        setNewBranchName('');
                        setError(null);
                      }}
                      disabled={isSubmitting}
                      className="px-3 py-2 bg-midnight-700 hover:bg-midnight-600 text-midnight-200 rounded text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* Branch list */
                <div className="max-h-64 overflow-y-auto border border-midnight-700 rounded">
                  {filteredBranches.length === 0 ? (
                    <div className="p-4 text-center text-midnight-500 text-sm">
                      {searchQuery
                        ? 'No branches match your search'
                        : 'No branches found'}
                    </div>
                  ) : (
                    filteredBranches.map((branch) => (
                      <button
                        key={branch}
                        onClick={() => handleSelectBranch(branch)}
                        disabled={isSubmitting}
                        className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-midnight-700 transition-colors border-b border-midnight-700/50 last:border-b-0 ${
                          branch === currentBranch ? 'bg-midnight-700/50' : ''
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <GitBranch
                            className={`w-4 h-4 ${
                              branch === currentBranch
                                ? 'text-brass-400'
                                : 'text-midnight-500'
                            }`}
                          />
                          <span
                            className={`text-sm ${
                              branch === currentBranch
                                ? 'text-midnight-100 font-medium'
                                : 'text-midnight-300'
                            }`}
                          >
                            {branch}
                          </span>
                        </span>
                        {branch === currentBranch && (
                          <span className="text-xs text-midnight-500">
                            current
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Create new branch button */}
              {!isCreating && (
                <button
                  onClick={() => setIsCreating(true)}
                  disabled={isSubmitting}
                  className="mt-4 w-full px-3 py-2 border border-dashed border-midnight-600 hover:border-brass-500 text-midnight-400 hover:text-brass-400 rounded text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create New Branch
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-midnight-700 bg-midnight-800/50 rounded-b-lg">
          <p className="text-xs text-midnight-500">
            Each branch is isolated in its own worktree, allowing multiple users
            to work on different branches simultaneously without conflicts.
          </p>
        </div>
      </div>
    </div>
  );
};
