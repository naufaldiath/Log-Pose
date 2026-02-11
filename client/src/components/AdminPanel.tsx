import { useState, useEffect, useCallback } from 'react';
import { X, Users, Shield, Save, AlertCircle, Check } from 'lucide-react';
import { getAdminSettings, updateAllowlistEmails, updateAdminEmails, type AdminSettings } from '@/api';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [allowlistInput, setAllowlistInput] = useState('');
  const [adminInput, setAdminInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAllowlist, setIsSavingAllowlist] = useState(false);
  const [isSavingAdmins, setIsSavingAdmins] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAdminSettings();
      setSettings(data);
      setAllowlistInput(data.allowlistEmails.join(', '));
      setAdminInput(data.adminEmails.join(', '));
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen, loadSettings]);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleSaveAllowlist = async () => {
    setIsSavingAllowlist(true);
    setError(null);
    try {
      const emails = allowlistInput
        .split(/[,\n]/)
        .map(e => e.trim())
        .filter(Boolean);

      const result = await updateAllowlistEmails(emails);
      setSettings(prev => prev ? { ...prev, allowlistEmails: result.emails, updatedAt: result.updatedAt } : null);
      showSuccess('Allowlist updated successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to update allowlist');
    } finally {
      setIsSavingAllowlist(false);
    }
  };

  const handleSaveAdmins = async () => {
    setIsSavingAdmins(true);
    setError(null);
    try {
      const emails = adminInput
        .split(/[,\n]/)
        .map(e => e.trim())
        .filter(Boolean);

      const result = await updateAdminEmails(emails);
      setSettings(prev => prev ? { ...prev, adminEmails: result.emails, updatedAt: result.updatedAt } : null);
      showSuccess('Admin list updated successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to update admin list');
    } finally {
      setIsSavingAdmins(false);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 bg-midnight-800 rounded-lg shadow-2xl border border-midnight-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-midnight-700">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-brass-400" />
            <h2 className="text-lg font-semibold text-midnight-100">
              Admin Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-midnight-400 hover:text-midnight-100 hover:bg-midnight-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status Messages */}
          {error && (
            <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-md bg-green-500/10 border border-green-500/20 flex items-start gap-2">
              <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-400">{successMessage}</p>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-midnight-600 border-t-brass-400 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Allowlist Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-midnight-400" />
                  <h3 className="text-sm font-medium text-midnight-200">
                    Allowed Emails
                  </h3>
                  <span className="text-xs text-midnight-500">
                    ({settings?.allowlistEmails.length || 0} users)
                  </span>
                </div>
                <p className="text-xs text-midnight-500">
                  Comma-separated or one per line. These users can access the application.
                </p>
                <textarea
                  value={allowlistInput}
                  onChange={(e) => setAllowlistInput(e.target.value)}
                  className="w-full h-32 px-3 py-2 bg-midnight-900 border border-midnight-700 rounded-md text-sm text-midnight-100 placeholder-midnight-500 focus:outline-none focus:ring-2 focus:ring-brass-500/50 focus:border-brass-500/50 resize-none"
                  placeholder="user1@example.com, user2@example.com"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveAllowlist}
                    disabled={isSavingAllowlist}
                    className="flex items-center gap-2 px-4 py-2 bg-brass-600 hover:bg-brass-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                  >
                    {isSavingAllowlist ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save Allowlist
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-midnight-700" />

              {/* Admin Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-midnight-400" />
                  <h3 className="text-sm font-medium text-midnight-200">
                    Admin Emails
                  </h3>
                  <span className="text-xs text-midnight-500">
                    ({settings?.adminEmails.length || 0} admins)
                  </span>
                </div>
                <p className="text-xs text-midnight-500">
                  Comma-separated or one per line. Admins must also be in the allowlist. They can access analytics and manage settings.
                </p>
                <textarea
                  value={adminInput}
                  onChange={(e) => setAdminInput(e.target.value)}
                  className="w-full h-32 px-3 py-2 bg-midnight-900 border border-midnight-700 rounded-md text-sm text-midnight-100 placeholder-midnight-500 focus:outline-none focus:ring-2 focus:ring-brass-500/50 focus:border-brass-500/50 resize-none"
                  placeholder="admin@example.com"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveAdmins}
                    disabled={isSavingAdmins}
                    className="flex items-center gap-2 px-4 py-2 bg-brass-600 hover:bg-brass-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                  >
                    {isSavingAdmins ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save Admins
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Last Updated */}
              {settings?.updatedAt && (
                <div className="text-xs text-midnight-500 text-right">
                  Last updated: {formatDate(settings.updatedAt)}
                  {settings.updatedBy && ` by ${settings.updatedBy}`}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
