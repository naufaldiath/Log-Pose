import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '@/stores/app';
import * as api from '@/api';
import type { SearchMatch } from '@/types';
import { Search, X, FileText, Loader2, Replace, ReplaceAll, Settings2 } from 'lucide-react';

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReplace, setShowReplace] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  // Search options
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [filePattern, setFilePattern] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const { selectedRepo, openFile, isSearchOpen, setSearchOpen } = useAppStore();

  // Focus input when opened
  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen]);

  // Handle search
  const handleSearch = useCallback(async () => {
    if (!selectedRepo || !query.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      // Build search options
      const options: Record<string, boolean | string> = {};
      if (caseSensitive) options.caseSensitive = true;
      if (useRegex) options.regex = true;
      if (wholeWord) options.wholeWord = true;
      if (filePattern) options.glob = filePattern;

      const response = await api.searchRepo(selectedRepo.repoId, query, options);
      setResults(response.matches);
    } catch (err: any) {
      setError(err.message);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [selectedRepo, query, caseSensitive, useRegex, wholeWord, filePattern]);

  // Handle replace in single file
  const handleReplace = useCallback(async (match: SearchMatch) => {
    if (!selectedRepo) return;

    try {
      const file = await api.getFile(selectedRepo.repoId, match.path);
      const lines = file.content.split('\n');
      const lineIndex = match.line - 1;

      if (lineIndex >= 0 && lineIndex < lines.length) {
        // Simple replace - could be enhanced to handle regex
        let newLine = lines[lineIndex];
        if (useRegex) {
          const flags = caseSensitive ? 'g' : 'gi';
          newLine = newLine.replace(new RegExp(query, flags), replaceText);
        } else {
          newLine = newLine.replace(query, replaceText);
        }
        lines[lineIndex] = newLine;

        await api.saveFile(selectedRepo.repoId, match.path, lines.join('\n'));

        // Remove this result from the list
        setResults(prev => prev.filter(r => !(r.path === match.path && r.line === match.line)));
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, [selectedRepo, query, replaceText, useRegex, caseSensitive]);

  // Handle replace all
  const handleReplaceAll = useCallback(async () => {
    if (!selectedRepo || !query.trim() || results.length === 0) return;

    const confirmed = confirm(`Replace "${query}" with "${replaceText}" in ${results.length} locations?`);
    if (!confirmed) return;

    setError(null);

    // Group results by file
    const byFile = new Map<string, SearchMatch[]>();
    for (const match of results) {
      const existing = byFile.get(match.path) || [];
      existing.push(match);
      byFile.set(match.path, existing);
    }

    let replacedCount = 0;

    for (const [path, matches] of byFile) {
      try {
        const file = await api.getFile(selectedRepo.repoId, path);
        let content = file.content;
        const lines = content.split('\n');

        // Sort matches by line number descending to avoid index shifting
        const sortedMatches = [...matches].sort((a, b) => b.line - a.line);

        for (const match of sortedMatches) {
          const lineIndex = match.line - 1;
          if (lineIndex >= 0 && lineIndex < lines.length) {
            if (useRegex) {
              const flags = caseSensitive ? 'g' : 'gi';
              lines[lineIndex] = lines[lineIndex].replace(new RegExp(query, flags), replaceText);
            } else {
              lines[lineIndex] = lines[lineIndex].replace(query, replaceText);
            }
            replacedCount++;
          }
        }

        await api.saveFile(selectedRepo.repoId, path, lines.join('\n'));
      } catch (err: any) {
        setError(`Error replacing in ${path}: ${err.message}`);
        return;
      }
    }

    // Clear results after replace
    setResults([]);
    setError(`Replaced ${replacedCount} occurrences`);
  }, [selectedRepo, query, replaceText, results, useRegex, caseSensitive]);

  // Handle key down
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    } else if (e.key === 'Escape') {
      setSearchOpen(false);
    }
  };

  // Handle result click
  const handleResultClick = (match: SearchMatch) => {
    openFile(match.path);
    // Don't close search panel to allow multiple replacements
  };

  // Handle global keyboard shortcut
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [setSearchOpen]);

  if (!isSearchOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setSearchOpen(false)}
      />

      {/* Search panel */}
      <div className="relative w-full max-w-3xl mx-4 bg-midnight-900 border border-midnight-600
                      rounded-lg shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-midnight-700">
          <Search size={20} className="text-midnight-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search in repository..."
            className="flex-1 bg-transparent text-midnight-100 placeholder-midnight-500
                       outline-none text-lg"
          />
          {isSearching && <Loader2 size={20} className="text-brass-500 animate-spin" />}

          {/* Toggle Replace */}
          <button
            onClick={() => setShowReplace(!showReplace)}
            className={`p-2 rounded transition-colors ${showReplace ? 'bg-brass-600 text-white' : 'text-midnight-400 hover:text-midnight-200 hover:bg-midnight-700'}`}
            title="Toggle Replace"
          >
            <Replace size={16} />
          </button>

          {/* Toggle Options */}
          <button
            onClick={() => setShowOptions(!showOptions)}
            className={`p-2 rounded transition-colors ${showOptions ? 'bg-brass-600 text-white' : 'text-midnight-400 hover:text-midnight-200 hover:bg-midnight-700'}`}
            title="Search Options"
          >
            <Settings2 size={16} />
          </button>

          <button
            onClick={() => setSearchOpen(false)}
            className="p-1 hover:bg-midnight-700 rounded text-midnight-400 hover:text-midnight-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Replace input */}
        {showReplace && (
          <div className="flex items-center gap-3 px-4 py-2 border-b border-midnight-700 bg-midnight-800/50">
            <Replace size={20} className="text-midnight-500" />
            <input
              ref={replaceInputRef}
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace with..."
              className="flex-1 bg-transparent text-midnight-100 placeholder-midnight-500
                         outline-none text-base"
            />
            {results.length > 0 && (
              <button
                onClick={handleReplaceAll}
                className="btn btn-primary text-sm flex items-center gap-1"
              >
                <ReplaceAll size={14} />
                Replace All ({results.length})
              </button>
            )}
          </div>
        )}

        {/* Search options */}
        {showOptions && (
          <div className="px-4 py-3 border-b border-midnight-700 bg-midnight-800/30">
            <div className="flex flex-wrap items-center gap-4">
              {/* Case sensitive */}
              <label className="flex items-center gap-2 text-sm text-midnight-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={(e) => setCaseSensitive(e.target.checked)}
                  className="rounded border-midnight-600 bg-midnight-700 text-brass-500 focus:ring-brass-500"
                />
                Case sensitive
              </label>

              {/* Regex */}
              <label className="flex items-center gap-2 text-sm text-midnight-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useRegex}
                  onChange={(e) => setUseRegex(e.target.checked)}
                  className="rounded border-midnight-600 bg-midnight-700 text-brass-500 focus:ring-brass-500"
                />
                Regex
              </label>

              {/* Whole word */}
              <label className="flex items-center gap-2 text-sm text-midnight-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wholeWord}
                  onChange={(e) => setWholeWord(e.target.checked)}
                  className="rounded border-midnight-600 bg-midnight-700 text-brass-500 focus:ring-brass-500"
                />
                Whole word
              </label>

              {/* File pattern */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-midnight-400">Files:</span>
                <input
                  type="text"
                  value={filePattern}
                  onChange={(e) => setFilePattern(e.target.value)}
                  placeholder="*.ts, *.tsx"
                  className="px-2 py-1 bg-midnight-800 border border-midnight-600 rounded text-sm text-midnight-200 outline-none focus:border-brass-500 w-32"
                />
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto max-h-[50vh]">
          {error && !error.startsWith('Replaced') && (
            <div className="px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {error?.startsWith('Replaced') && (
            <div className="px-4 py-3 text-green-400 text-sm">
              {error}
            </div>
          )}

          {!error && results.length === 0 && query && !isSearching && (
            <div className="px-4 py-8 text-center text-midnight-500">
              No results found
            </div>
          )}

          {results.map((match, index) => (
            <div
              key={`${match.path}-${match.line}-${index}`}
              className="group flex items-start gap-3 px-4 py-2 hover:bg-midnight-800
                         text-left transition-colors border-b border-midnight-800/50"
            >
              <button
                onClick={() => handleResultClick(match)}
                className="flex-1 flex items-start gap-3 min-w-0"
              >
                <FileText size={16} className="text-midnight-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-midnight-200 truncate">
                      {match.path}
                    </span>
                    <span className="text-xs text-midnight-500">
                      :{match.line}
                    </span>
                  </div>
                  <div className="text-sm text-midnight-400 truncate font-mono">
                    {match.text}
                  </div>
                </div>
              </button>

              {/* Replace button for individual match */}
              {showReplace && (
                <button
                  onClick={() => handleReplace(match)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-midnight-700 rounded text-midnight-400 hover:text-midnight-200 transition-opacity"
                  title="Replace this occurrence"
                >
                  <Replace size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-midnight-700 text-xs text-midnight-500 flex gap-4">
          <span>
            <kbd className="px-1.5 py-0.5 bg-midnight-800 rounded">Enter</kbd> to search
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-midnight-800 rounded">Esc</kbd> to close
          </span>
          {results.length > 0 && (
            <span className="ml-auto">
              {results.length} result{results.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
