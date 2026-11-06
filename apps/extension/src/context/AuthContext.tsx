import React, { createContext, useContext, useEffect, useState } from 'react';
import { storageService, StoredUser, ThemeMode } from '../services/storageService.js';
import { apiClient } from '../services/apiClient.js';
import { RegisterUserInput, LoginUserInput } from '@openproofpay/shared';

interface AuthContextType {
  user: StoredUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  theme: ThemeMode;
  login: (input: LoginUserInput) => Promise<void>;
  register: (input: RegisterUserInput) => Promise<void>;
  logout: () => Promise<void>;
  toggleTheme: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [theme, setTheme] = useState<ThemeMode>('dark');

  useEffect(() => {
    async function initAuth() {
      try {
        const storedTheme = await storageService.getTheme();
        setTheme(storedTheme);
        document.documentElement.setAttribute('data-theme', storedTheme);

        const token = await storageService.getAccessToken();
        if (token) {
          const storedUser = await storageService.getUser();
          if (storedUser) {
            setUser(storedUser);
          }
          // Verify and sync live user data with backend
          try {
            const liveData = await apiClient.getMe();
            if (liveData?.user) {
              setUser(liveData.user);
            }
          } catch {
            // Keep stored profile if offline or momentary error
          }
        }
      } catch (err) {
        console.error('Failed to initialize session:', err);
      } finally {
        setIsLoading(false);
      }
    }
    initAuth();
  }, []);

  const login = async (input: LoginUserInput) => {
    const data = await apiClient.login(input);
    if (data?.user) {
      setUser(data.user);
    }
  };

  const register = async (input: RegisterUserInput) => {
    const data = await apiClient.register(input);
    if (data?.user) {
      setUser(data.user);
    }
  };

  const logout = async () => {
    await apiClient.logout();
    setUser(null);
  };

  const toggleTheme = async () => {
    const newTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    await storageService.setTheme(newTheme);
  };

  const refreshProfile = async () => {
    const data = await apiClient.getMe();
    if (data?.user) {
      setUser(data.user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        theme,
        login,
        register,
        logout,
        toggleTheme,
        refreshProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
