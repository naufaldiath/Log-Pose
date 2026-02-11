import { useState } from 'react';
import { useAppStore } from '@/stores/app';
import { ChevronDown, FolderGit2 } from 'lucide-react';

export function RepoSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const { repos, selectedRepo, selectRepo } = useAppStore();
  
  const handleSelect = (repo: typeof repos[0]) => {
    selectRepo(repo);
    setIsOpen(false);
  };
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-midnight-800 hover:bg-midnight-700 
                   border border-midnight-600 rounded text-sm transition-colors"
      >
        <FolderGit2 size={16} className="text-brass-500" />
        <span className="truncate max-w-[200px]">
          {selectedRepo?.name || 'Select Repository'}
        </span>
        <ChevronDown 
          size={16} 
          className={`text-midnight-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>
      
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-1 w-64 max-h-80 overflow-y-auto
                          bg-midnight-900 border border-midnight-600 rounded-lg shadow-xl z-50">
            {repos.length === 0 ? (
              <div className="px-4 py-3 text-sm text-midnight-500">
                No repositories found
              </div>
            ) : (
              <div className="py-1">
                {repos.map((repo) => (
                  <button
                    key={repo.repoId}
                    onClick={() => handleSelect(repo)}
                    className={`w-full flex items-center gap-2 px-4 py-2 text-left text-sm
                               hover:bg-midnight-800 transition-colors
                               ${selectedRepo?.repoId === repo.repoId 
                                 ? 'bg-teal-900/30 text-teal-300' 
                                 : 'text-midnight-200'}`}
                  >
                    <FolderGit2 
                      size={16} 
                      className={selectedRepo?.repoId === repo.repoId 
                        ? 'text-teal-400' 
                        : 'text-brass-500'} 
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{repo.name}</div>
                      <div className="truncate text-xs text-midnight-500">
                        {repo.pathHint}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
