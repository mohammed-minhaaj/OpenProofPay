import { UserRole } from '@openproofpay/shared';

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  githubConnected?: boolean;
  githubUsername?: string;
  paypalEmail?: string;
}

export type ThemeMode = 'dark' | 'light';

const KEYS = {
  ACCESS_TOKEN: 'opp_access_token',
  REFRESH_TOKEN: 'opp_refresh_token',
  USER_PROFILE: 'opp_user_profile',
  THEME_MODE: 'opp_theme_mode',
  ACTIVE_GITHUB_CONTEXT: 'opp_active_github_context'
} as const;

export interface GitHubContext {
  owner: string;
  repo: string;
  type?: 'issue' | 'pull' | 'repo';
  number?: number;
  url: string;
  title?: string;
}

class StorageService {
  private hasChromeStorage(): boolean {
    return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
  }

  async getAccessToken(): Promise<string | null> {
    if (this.hasChromeStorage()) {
      const data = await chrome.storage.local.get(KEYS.ACCESS_TOKEN);
      return (data[KEYS.ACCESS_TOKEN] as string) || null;
    }
    return localStorage.getItem(KEYS.ACCESS_TOKEN);
  }

  async getRefreshToken(): Promise<string | null> {
    if (this.hasChromeStorage()) {
      const data = await chrome.storage.local.get(KEYS.REFRESH_TOKEN);
      return (data[KEYS.REFRESH_TOKEN] as string) || null;
    }
    return localStorage.getItem(KEYS.REFRESH_TOKEN);
  }

  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    if (this.hasChromeStorage()) {
      await chrome.storage.local.set({
        [KEYS.ACCESS_TOKEN]: accessToken,
        [KEYS.REFRESH_TOKEN]: refreshToken
      });
    } else {
      localStorage.setItem(KEYS.ACCESS_TOKEN, accessToken);
      localStorage.setItem(KEYS.REFRESH_TOKEN, refreshToken);
    }
  }

  async clearTokens(): Promise<void> {
    if (this.hasChromeStorage()) {
      await chrome.storage.local.remove([KEYS.ACCESS_TOKEN, KEYS.REFRESH_TOKEN, KEYS.USER_PROFILE]);
    } else {
      localStorage.removeItem(KEYS.ACCESS_TOKEN);
      localStorage.removeItem(KEYS.REFRESH_TOKEN);
      localStorage.removeItem(KEYS.USER_PROFILE);
    }
  }

  async getUser(): Promise<StoredUser | null> {
    if (this.hasChromeStorage()) {
      const data = await chrome.storage.local.get(KEYS.USER_PROFILE);
      return (data[KEYS.USER_PROFILE] as StoredUser) || null;
    }
    const val = localStorage.getItem(KEYS.USER_PROFILE);
    return val ? (JSON.parse(val) as StoredUser) : null;
  }

  async setUser(user: StoredUser): Promise<void> {
    if (this.hasChromeStorage()) {
      await chrome.storage.local.set({ [KEYS.USER_PROFILE]: user });
    } else {
      localStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(user));
    }
  }

  async getTheme(): Promise<ThemeMode> {
    if (this.hasChromeStorage()) {
      const data = await chrome.storage.local.get(KEYS.THEME_MODE);
      return (data[KEYS.THEME_MODE] as ThemeMode) || 'dark';
    }
    return (localStorage.getItem(KEYS.THEME_MODE) as ThemeMode) || 'dark';
  }

  async setTheme(theme: ThemeMode): Promise<void> {
    if (this.hasChromeStorage()) {
      await chrome.storage.local.set({ [KEYS.THEME_MODE]: theme });
    } else {
      localStorage.setItem(KEYS.THEME_MODE, theme);
    }
  }

  async getGitHubContext(): Promise<GitHubContext | null> {
    if (this.hasChromeStorage()) {
      const data = await chrome.storage.local.get(KEYS.ACTIVE_GITHUB_CONTEXT);
      return (data[KEYS.ACTIVE_GITHUB_CONTEXT] as GitHubContext) || null;
    }
    const val = localStorage.getItem(KEYS.ACTIVE_GITHUB_CONTEXT);
    return val ? (JSON.parse(val) as GitHubContext) : null;
  }

  async setGitHubContext(ctx: GitHubContext | null): Promise<void> {
    if (this.hasChromeStorage()) {
      if (ctx) {
        await chrome.storage.local.set({ [KEYS.ACTIVE_GITHUB_CONTEXT]: ctx });
      } else {
        await chrome.storage.local.remove(KEYS.ACTIVE_GITHUB_CONTEXT);
      }
    } else {
      if (ctx) {
        localStorage.setItem(KEYS.ACTIVE_GITHUB_CONTEXT, JSON.stringify(ctx));
      } else {
        localStorage.removeItem(KEYS.ACTIVE_GITHUB_CONTEXT);
      }
    }
  }
}

export const storageService = new StorageService();
