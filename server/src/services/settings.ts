import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../utils/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Settings {
  allowlistEmails: string[];
  adminEmails: string[];
  updatedAt: string;
  updatedBy?: string;
}

const DEFAULT_SETTINGS_PATH = path.join(process.cwd(), 'data', 'settings.json');

class SettingsManager {
  private settings: Settings;
  private settingsPath: string;
  private initialized: boolean = false;

  constructor(settingsPath: string = DEFAULT_SETTINGS_PATH) {
    this.settingsPath = settingsPath;
    this.settings = this.loadSettings();
  }

  private loadSettings(): Settings {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.settingsPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Try to load existing settings
      if (fs.existsSync(this.settingsPath)) {
        const content = fs.readFileSync(this.settingsPath, 'utf-8');
        const parsed = JSON.parse(content) as Settings;
        this.initialized = true;
        return {
          allowlistEmails: parsed.allowlistEmails || [],
          adminEmails: parsed.adminEmails || [],
          updatedAt: parsed.updatedAt || new Date().toISOString(),
          updatedBy: parsed.updatedBy,
        };
      }
    } catch (error) {
      console.error('Failed to load settings, using defaults:', error);
    }

    // Initialize from environment variables if no settings file exists
    const defaultSettings: Settings = {
      allowlistEmails: config.ALLOWLIST_EMAILS,
      adminEmails: config.ADMIN_EMAILS || [...config.ALLOWLIST_EMAILS],
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    };

    // Save initial settings
    this.saveSettings(defaultSettings);
    this.initialized = true;

    return defaultSettings;
  }

  private saveSettings(settings: Settings): void {
    try {
      const dataDir = path.dirname(this.settingsPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw new Error('Failed to save settings');
    }
  }

  getSettings(): Settings {
    return { ...this.settings };
  }

  getAllowlistEmails(): string[] {
    return [...this.settings.allowlistEmails];
  }

  getAdminEmails(): string[] {
    return [...this.settings.adminEmails];
  }

  isEmailAllowed(email: string): boolean {
    const normalizedEmail = email.toLowerCase().trim();
    return this.settings.allowlistEmails.includes(normalizedEmail);
  }

  isAdmin(email: string): boolean {
    const normalizedEmail = email.toLowerCase().trim();
    // Safety check: if admin list is empty, fall back to allowlist
    if (this.settings.adminEmails.length === 0) {
      return this.settings.allowlistEmails.includes(normalizedEmail);
    }
    return this.settings.adminEmails.includes(normalizedEmail);
  }

  updateAllowlistEmails(emails: string[], updatedBy: string): void {
    const normalizedEmails = emails
      .map(e => e.toLowerCase().trim())
      .filter(Boolean);

    // Prevent removing the last admin
    if (normalizedEmails.length === 0) {
      throw new Error('Allowlist cannot be empty');
    }

    this.settings = {
      ...this.settings,
      allowlistEmails: normalizedEmails,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };

    this.saveSettings(this.settings);
  }

  updateAdminEmails(emails: string[], updatedBy: string): void {
    const normalizedEmails = emails
      .map(e => e.toLowerCase().trim())
      .filter(Boolean);

    // All admins must be in the allowlist
    const invalidAdmins = normalizedEmails.filter(
      email => !this.settings.allowlistEmails.includes(email)
    );

    if (invalidAdmins.length > 0) {
      throw new Error(
        `These admin emails are not in the allowlist: ${invalidAdmins.join(', ')}`
      );
    }

    // Prevent removing the last admin
    if (normalizedEmails.length === 0) {
      throw new Error('Admin list cannot be empty');
    }

    this.settings = {
      ...this.settings,
      adminEmails: normalizedEmails,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };

    this.saveSettings(this.settings);
  }

  // Reload settings from disk (useful for external updates)
  reload(): void {
    this.settings = this.loadSettings();
  }
}

export const settingsManager = new SettingsManager();

// Re-export types
export type { Settings };
