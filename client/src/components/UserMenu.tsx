import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/stores/app';
import {
  Settings,
  BarChart3,
  Shield,
  ChevronDown,
  Circle,
} from 'lucide-react';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

interface UserMenuProps {
  connectionState: ConnectionState;
}

export function UserMenu({ connectionState }: UserMenuProps) {
  const { user, setSessionManagerOpen, setAdminPanelOpen } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!user) return null;

  // Get user initials for avatar
  const initials = user.email
    .split('@')[0]
    .split(/[-._]/)
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Get connection status info
  const connectionStatus = {
    disconnected: { color: 'text-red-500', label: 'Disconnected', pulse: false },
    connecting: { color: 'text-yellow-500', label: 'Connecting...', pulse: true },
    connected: { color: 'text-green-500', label: 'Connected', pulse: false },
  }[connectionState];

  return (
    <div className="relative" ref={menuRef}>
      {/* User menu button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 py-1.5 hover:bg-midnight-800 rounded text-midnight-300 hover:text-midnight-100 transition-colors"
        aria-label="User menu"
      >
        {/* Avatar */}
        <div className="w-7 h-7 bg-brass-600 rounded flex items-center justify-center text-white text-xs font-medium">
          {initials}
        </div>

        {/* User email - hidden on mobile */}
        <span className="hidden md:block text-sm truncate max-w-[120px]">
          {user.email.split('@')[0]}
        </span>

        {/* Chevron indicator */}
        <ChevronDown
          size={14}
          className={`hidden md:block transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Connection status indicator - small dot */}
      <div
        className="absolute -top-0.5 -right-0.5"
        title={connectionStatus.label}
      >
        <Circle
          size={8}
          className={connectionStatus.color + (connectionStatus.pulse ? ' animate-pulse' : '')}
          fill="currentColor"
        />
      </div>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-midnight-800 border border-midnight-700 rounded-lg shadow-xl z-50 py-1">
          {/* User info header */}
          <div className="px-3 py-2 border-b border-midnight-700">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-brass-600 rounded flex items-center justify-center text-white text-sm font-medium">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-midnight-100 truncate">
                  {user.email.split('@')[0]}
                </p>
                <p className="text-xs text-midnight-400 truncate">
                  {user.email}
                </p>
              </div>
            </div>
            {/* Connection status in menu */}
            <div className={`mt-2 text-xs flex items-center gap-1.5 ${connectionStatus.color}`}>
              <Circle size={6} fill="currentColor" />
              <span>{connectionStatus.label}</span>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            {/* Manage Sessions - all users */}
            <button
              onClick={() => {
                setSessionManagerOpen(true);
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-midnight-300 hover:text-midnight-100 hover:bg-midnight-700 transition-colors"
            >
              <Settings size={16} />
              <span>Manage Sessions</span>
            </button>

            {/* Admin-only items */}
            {user.isAdmin && (
              <>
                {/* Analytics Dashboard */}
                <button
                  onClick={() => {
                    // Analytics is handled in App.tsx with local state
                    const event = new CustomEvent('open-analytics');
                    window.dispatchEvent(event);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-midnight-300 hover:text-midnight-100 hover:bg-midnight-700 transition-colors"
                >
                  <BarChart3 size={16} />
                  <span>Analytics Dashboard</span>
                </button>

                {/* Admin Settings */}
                <button
                  onClick={() => {
                    setAdminPanelOpen(true);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-midnight-300 hover:text-midnight-100 hover:bg-midnight-700 transition-colors"
                >
                  <Shield size={16} />
                  <span>Admin Settings</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
