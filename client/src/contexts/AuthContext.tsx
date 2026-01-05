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
}

interface AuthContextType {
  user: DiscordUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (returnTo?: string) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
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
    queryClient.invalidateQueries({ queryKey: ['auth'] });
  }, [queryClient]);
  
  const refreshUser = useCallback(async () => {
    await refetch();
  }, [refetch]);
  
  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated,
      login,
      logout,
      refreshUser,
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