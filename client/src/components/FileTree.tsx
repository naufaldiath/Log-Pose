import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '@/stores/app';
import type { FileEntry } from '@/types';
import * as api from '@/api';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  FileJson,
  File,
  RefreshCw,
  Plus,
  Search,
  X,
  Edit3,
  Trash2,
  FolderPlus
} from 'lucide-react';

function getFileIcon(name: string, type: 'file' | 'dir', isOpen = false) {
  if (type === 'dir') {
    return isOpen ? (
      <FolderOpen size={16} className="text-brass-500" />
    ) : (
      <Folder size={16} className="text-brass-500" />
    );
  }

  const ext = name.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return <FileCode size={16} className="text-blue-400" />;
    case 'json':
      return <FileJson size={16} className="text-yellow-400" />;
    case 'md':
    case 'txt':
      return <FileText size={16} className="text-midnight-400" />;
    case 'py':
      return <FileCode size={16} className="text-green-400" />;
    case 'css':
    case 'scss':
      return <FileCode size={16} className="text-pink-400" />;
    case 'html':
      return <FileCode size={16} className="text-orange-400" />;
    default:
      return <File size={16} className="text-midnight-400" />;
  }
}

interface TreeNodeProps {
  entry: FileEntry;
  path: string;
  depth: number;
  filterText: string;
  onContextMenu: (e: React.MouseEvent, path: string, type: 'file' | 'dir') => void;
}

function TreeNode({ entry, path, depth, filterText, onContextMenu }: TreeNodeProps) {
  const {
    fileTree,
    expandedDirs,
    selectedPath,
    toggleDirectory,
    openFile
  } = useAppStore();

  const fullPath = path ? `${path}/${entry.name}` : entry.name;
  const isExpanded = expandedDirs.has(fullPath);
  const isSelected = selectedPath === fullPath;
  const children = fileTree.get(fullPath) || [];

  // Filter logic: show if matches filter or has matching children
  const matchesFilter = filterText
    ? entry.name.toLowerCase().includes(filterText.toLowerCase())
    : true;

  const hasMatchingChildren = filterText
    ? children.some(child =>
        child.name.toLowerCase().includes(filterText.toLowerCase()) ||
        (child.type === 'dir' && hasMatchingDescendants(child, fullPath, filterText))
      )
    : true;

  const shouldShow = matchesFilter || hasMatchingChildren;

  function hasMatchingDescendants(child: FileEntry, childPath: string, filter: string): boolean {
    const childFullPath = childPath ? `${childPath}/${child.name}` : child.name;
    const childChildren = fileTree.get(childFullPath) || [];
    return childChildren.some(c =>
      c.name.toLowerCase().includes(filter.toLowerCase()) ||
      (c.type === 'dir' && hasMatchingDescendants(c, childFullPath, filter))
    );
  }

  const handleClick = () => {
    if (entry.type === 'dir') {
      toggleDirectory(fullPath);
    } else {
      openFile(fullPath);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, fullPath, entry.type);
  };

  if (!shouldShow && filterText) {
    return null;
  }

  // Auto-expand if filtering and has matching children
  const effectiveIsExpanded = filterText && hasMatchingChildren ? true : isExpanded;

  return (
    <div>
      <div
        className={`file-tree-item ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        tabIndex={0}
        role="treeitem"
        aria-expanded={entry.type === 'dir' ? effectiveIsExpanded : undefined}
      >
        {entry.type === 'dir' && (
          <span className="w-4 h-4 flex items-center justify-center">
            {effectiveIsExpanded ? (
              <ChevronDown size={14} className="text-midnight-500" />
            ) : (
              <ChevronRight size={14} className="text-midnight-500" />
            )}
          </span>
        )}
        {entry.type === 'file' && <span className="w-4" />}

        {getFileIcon(entry.name, entry.type, effectiveIsExpanded)}

        <span className="truncate text-sm">{entry.name}</span>
      </div>

      {entry.type === 'dir' && effectiveIsExpanded && children.length > 0 && (
        <div role="group">
          {children.map((child) => (
            <TreeNode
              key={child.name}
              entry={child}
              path={fullPath}
              depth={depth + 1}
              filterText={filterText}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ContextMenuState {
  x: number;
  y: number;
  path: string;
  type: 'file' | 'dir';
}

interface InlineInputState {
  path: string;
  type: 'create-file' | 'create-dir' | 'rename';
  value: string;
}

export function FileTree() {
  const { selectedRepo, fileTree, loadDirectory, openFile, setError } = useAppStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [inlineInput, setInlineInput] = useState<InlineInputState | null>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  const rootEntries = fileTree.get('.') || fileTree.get('') || [];

  // Focus inline input when shown
  useEffect(() => {
    if (inlineInput && inlineInputRef.current) {
      inlineInputRef.current.focus();
      inlineInputRef.current.select();
    }
  }, [inlineInput]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  const handleRefresh = async () => {
    if (!selectedRepo) return;
    setIsRefreshing(true);
    await loadDirectory('');
    setIsRefreshing(false);
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string, type: 'file' | 'dir') => {
    setContextMenu({ x: e.clientX, y: e.clientY, path, type });
  }, []);

  const handleCreateFile = (parentPath: string) => {
    setInlineInput({ path: parentPath, type: 'create-file', value: '' });
    setContextMenu(null);
  };

  const handleCreateDir = (parentPath: string) => {
    setInlineInput({ path: parentPath, type: 'create-dir', value: '' });
    setContextMenu(null);
  };

  const handleRename = (path: string) => {
    const name = path.split('/').pop() || '';
    setInlineInput({ path, type: 'rename', value: name });
    setContextMenu(null);
  };

  const handleDelete = async (path: string, type: 'file' | 'dir') => {
    if (!selectedRepo) return;

    const name = path.split('/').pop() || path;
    const confirmed = confirm(`Are you sure you want to delete ${type === 'dir' ? 'folder' : 'file'} "${name}"?`);
    if (!confirmed) return;

    try {
      await api.deleteFile(selectedRepo.repoId, path);
      // Refresh parent directory
      const parentPath = path.split('/').slice(0, -1).join('/');
      await loadDirectory(parentPath);
    } catch (err: any) {
      setError(err.message);
    }
    setContextMenu(null);
  };

  const handleInlineSubmit = async () => {
    if (!selectedRepo || !inlineInput) return;

    const name = inlineInput.value.trim();
    if (!name) {
      setInlineInput(null);
      return;
    }

    try {
      if (inlineInput.type === 'create-file') {
        const newPath = inlineInput.path
          ? `${inlineInput.path}/${name}`
          : name;
        await api.saveFile(selectedRepo.repoId, newPath, '');
        await loadDirectory(inlineInput.path);
        openFile(newPath);
      } else if (inlineInput.type === 'create-dir') {
        // Create a placeholder file to represent the directory
        const newPath = inlineInput.path
          ? `${inlineInput.path}/${name}/.gitkeep`
          : `${name}/.gitkeep`;
        await api.saveFile(selectedRepo.repoId, newPath, '');
        await loadDirectory(inlineInput.path);
      } else if (inlineInput.type === 'rename') {
        const oldContent = await api.getFile(selectedRepo.repoId, inlineInput.path);
        const parentPath = inlineInput.path.split('/').slice(0, -1).join('/');
        const newPath = parentPath
          ? `${parentPath}/${name}`
          : name;
        await api.saveFile(selectedRepo.repoId, newPath, oldContent.content);
        await api.deleteFile(selectedRepo.repoId, inlineInput.path);
        await loadDirectory(parentPath);
      }
    } catch (err: any) {
      setError(err.message);
    }

    setInlineInput(null);
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInlineSubmit();
    } else if (e.key === 'Escape') {
      setInlineInput(null);
    }
  };

  if (!selectedRepo) {
    return (
      <div className="p-4 text-center text-midnight-500">
        <p className="text-sm">Select a repository</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-midnight-700">
        <span className="text-sm font-medium text-midnight-200 truncate">
          {selectedRepo.name}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleCreateFile('')}
            className="p-1.5 hover:bg-midnight-700 rounded text-midnight-400 hover:text-midnight-200 transition-colors"
            title="New File"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => handleCreateDir('')}
            className="p-1.5 hover:bg-midnight-700 rounded text-midnight-400 hover:text-midnight-200 transition-colors"
            title="New Folder"
          >
            <FolderPlus size={14} />
          </button>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 hover:bg-midnight-700 rounded text-midnight-400 hover:text-midnight-200 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="px-3 py-2 border-b border-midnight-700">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-midnight-500" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter files..."
            className="w-full bg-midnight-800 border border-midnight-600 rounded pl-8 pr-7 py-1.5 text-sm text-midnight-200 placeholder-midnight-500 outline-none focus:border-brass-500"
          />
          {filterText && (
            <button
              onClick={() => setFilterText('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-midnight-500 hover:text-midnight-300"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-2" role="tree">
        {/* Inline input for root level */}
        {inlineInput?.path === '' && (
          <div className="px-2 py-1">
            <input
              ref={inlineInputRef}
              type="text"
              value={inlineInput.value}
              onChange={(e) => setInlineInput({ ...inlineInput, value: e.target.value })}
              onKeyDown={handleInlineKeyDown}
              onBlur={handleInlineSubmit}
              placeholder={inlineInput.type === 'create-dir' ? 'folder name' : 'file name'}
              className="file-tree-input w-full"
            />
          </div>
        )}

        {rootEntries.length > 0 ? (
          rootEntries.map((entry) => (
            <TreeNode
              key={entry.name}
              entry={entry}
              path=""
              depth={0}
              filterText={filterText}
              onContextMenu={handleContextMenu}
            />
          ))
        ) : (
          <div className="px-4 py-2 text-sm text-midnight-500">
            Loading...
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'dir' && (
            <>
              <button
                className="context-menu-item"
                onClick={() => handleCreateFile(contextMenu.path)}
              >
                <Plus size={14} />
                New File
              </button>
              <button
                className="context-menu-item"
                onClick={() => handleCreateDir(contextMenu.path)}
              >
                <FolderPlus size={14} />
                New Folder
              </button>
              <div className="context-menu-separator" />
            </>
          )}
          <button
            className="context-menu-item"
            onClick={() => handleRename(contextMenu.path)}
          >
            <Edit3 size={14} />
            Rename
          </button>
          <button
            className="context-menu-item danger"
            onClick={() => handleDelete(contextMenu.path, contextMenu.type)}
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
