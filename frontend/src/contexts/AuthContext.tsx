import React, { useState, useEffect, type ReactNode } from 'react';
import { type LoginResponse, type User } from '../types/api';
import apiClient, { authTokenStorage } from '../api/client';
import { AuthContext, type AuthContextType } from './AuthContextValue';

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      if (authTokenStorage.get()) {
        try {
          const response = await apiClient.getCurrentUser();
          setUser(response.user);
        } catch (error) {
          console.error('Auth check failed:', error);
          authTokenStorage.clear();
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const startSession = (response: LoginResponse) => {
    authTokenStorage.set(response.token);
    setUser(response.user);
  };

  const login = async (email: string, password: string) => {
    try {
      startSession(await apiClient.login({ email, password }));
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const register = async (email: string, password: string) => {
    try {
      startSession(await apiClient.register({ email, password }));
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
    authTokenStorage.clear();
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
