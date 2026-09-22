import React, { useState, useEffect, type ReactNode } from 'react';
import { type User } from '../types/api';
import apiClient, { getToken, setToken, clearToken } from '../api/client';
import { AuthContext, type AuthContextType } from './AuthContextValue';

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      if (getToken()) {
        try {
          const response = await apiClient.getCurrentUser();
          setUser(response.user);
        } catch (error) {
          console.error('Auth check failed:', error);
          clearToken();
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await apiClient.login(email, password);
    setToken(response.token);
    setUser(response.user);
  };

  const register = async (email: string, password: string) => {
    const response = await apiClient.register(email, password);
    setToken(response.token);
    setUser(response.user);
  };

  const logout = () => {
    setUser(null);
    clearToken();
  };

  const value: AuthContextType = {
    user,
    login,
    register,
    logout,
    isLoading,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
