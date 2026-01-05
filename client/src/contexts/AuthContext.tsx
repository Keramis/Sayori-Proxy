import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// User type matching the API response
interface DiscordUser {
  id: string;
  username: string;
  globalName?: string;
  email?: string;
  avatar?: string;
  avatarUrl: string;
  authorizedIp?: string;
  currentIp?: string;
}

interface AuthContextType {
  user: DiscordUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (returnTo?: string) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateIp: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  
  // Fetch current user
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch user');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
  
  const user = data?.authenticated ? data.user : null;
  const isAuthenticated = !!user;

  // Update localStorage with authorized IP when user data is fetched
  useEffect(() => {
    if (user?.authorizedIp) {
      localStorage.setItem('authorized_ip', user.authorizedIp);
    } else if (!isLoading && !user) {
      // Clear if not logged in
      localStorage.removeItem('authorized_ip');
    }
  }, [user, isLoading]);
  
  const login = useCallback((returnTo?: string) => {
    const url = returnTo
      ? `/api/auth/discord?returnTo=${encodeURIComponent(returnTo)}`
      : '/api/auth/discord';
    window.location.href = url;
  }, []);
  
  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    localStorage.removeItem('authorized_ip');
    queryClient.invalidateQueries({ queryKey: ['auth'] });
  }, [queryClient]);
  
  const refreshUser = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const updateIp = useCallback(async () => {
    const response = await fetch('/api/auth/update-ip', {
      method: 'POST',
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to update IP');
    }

    if (data.ip) {
      localStorage.setItem('authorized_ip', data.ip);
      await refetch();
    }
  }, [refetch]);
  
  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated,
      login,
      logout,
      refreshUser,
      updateIp,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}