/**
 * Auth Context
 * 
 * Provides centralized access to auth bootstrap state.
 * Used for consistent auth gating across the app.
 */

import React, { createContext, useContext, ReactNode } from "react";
import type { AuthBootstrapState } from "./authBootstrap";

interface AuthContextType {
  state: AuthBootstrapState | "checking" | "error";
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  state: AuthBootstrapState | "checking" | "error";
}

export function AuthProvider({ children, state }: AuthProviderProps) {
  const isAuthenticated = state === "authed";

  return (
    <AuthContext.Provider value={{ state, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

/**
 * Hook to check if user is authenticated based on authBootstrap state.
 * This is the ONLY reliable way to check auth status.
 */
export function useIsAuthenticated(): boolean {
  const { isAuthenticated } = useAuth();
  return isAuthenticated;
}
