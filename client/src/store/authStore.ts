import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Player } from '@dueled/shared';
import { AuthService } from '../services/authService';

export interface AuthState {
  // State
  user: Player | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  
  // Actions
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, email: string, password: string, confirmPassword: string) => Promise<boolean>;
  loginAnonymous: () => Promise<boolean>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  clearError: () => void;
  initializeAuth: () => void;
  updateProfile: (updates: Partial<Player>) => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        isRefreshing: false,
        error: null,

        // Initialize authentication from stored data
        initializeAuth: () => {
          const token = AuthService.getToken();
          const user = AuthService.getStoredUser();
          
          if (token && user) {
            set({
              token,
              user,
              isAuthenticated: true,
              error: null,
            });
            
            // Verify token validity in background (but don't immediately logout on failure)
            setTimeout(() => {
              const currentState = get();
              if (currentState.isAuthenticated) {
                get().refreshToken().catch(() => {
                  // Only logout if we're still authenticated and refresh definitely failed
                  console.warn('Token refresh failed during initialization');
                });
              }
            }, 1000); // Wait 1 second before attempting refresh
          } else {
            set({
              token: null,
              user: null,
              isAuthenticated: false,
              error: null,
            });
          }
        },

        // Login with username and password
        login: async (username: string, password: string): Promise<boolean> => {
          const currentState = get();
          
          // Prevent concurrent login requests
          if (currentState.isLoading) {
            console.warn('Login already in progress, skipping duplicate request');
            return false;
          }
          
          set({ isLoading: true, error: null });
          
          try {
            const response = await AuthService.login({ username, password });
            
            if (response.success && response.token && response.player) {
              set({
                user: response.player,
                token: response.token,
                isAuthenticated: true,
                isLoading: false,
                error: null,
              });
              return true;
            } else {
              set({
                isLoading: false,
                error: response.error || 'Login failed',
              });
              return false;
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Login failed';
            set({
              isLoading: false,
              error: errorMessage,
            });
            return false;
          }
        },

        // Register new account
        register: async (username: string, email: string, password: string, confirmPassword: string): Promise<boolean> => {
          const currentState = get();
          
          // Prevent concurrent register requests
          if (currentState.isLoading) {
            console.warn('Registration already in progress, skipping duplicate request');
            return false;
          }
          
          set({ isLoading: true, error: null });
          
          try {
            const response = await AuthService.register({ username, email, password, confirmPassword });
            
            if (response.success && response.token && response.player) {
              set({
                user: response.player,
                token: response.token,
                isAuthenticated: true,
                isLoading: false,
                error: null,
              });
              return true;
            } else {
              set({
                isLoading: false,
                error: response.error || 'Registration failed',
              });
              return false;
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Registration failed';
            set({
              isLoading: false,
              error: errorMessage,
            });
            return false;
          }
        },

        // Login as anonymous user
        loginAnonymous: async (): Promise<boolean> => {
          set({ isLoading: true, error: null });
          
          try {
            const response = await AuthService.createAnonymousSession();
            
            if (response.success && response.token && response.player) {
              set({
                user: response.player,
                token: response.token,
                isAuthenticated: true,
                isLoading: false,
                error: null,
              });
              return true;
            } else {
              set({
                isLoading: false,
                error: response.error || 'Failed to create guest session',
              });
              return false;
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to create guest session';
            set({
              isLoading: false,
              error: errorMessage,
            });
            return false;
          }
        },

        // Logout user
        logout: async (): Promise<void> => {
          set({ isLoading: true });
          
          try {
            await AuthService.logout();
          } catch (error) {
            console.warn('Logout request failed:', error);
          } finally {
            set({
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false,
              error: null,
            });
          }
        },

        // Refresh authentication token
        refreshToken: async (): Promise<boolean> => {
          const currentState = get();
          
          // Prevent concurrent refresh requests
          if (currentState.isRefreshing) {
            console.warn('Token refresh already in progress, skipping duplicate request');
            return currentState.isAuthenticated;
          }
          
          set({ isRefreshing: true });
          
          try {
            const response = await AuthService.refreshToken();
            
            if (response.success && response.token && response.player) {
              set({
                user: response.player,
                token: response.token,
                isAuthenticated: true,
                isRefreshing: false,
                error: null,
              });
              return true;
            } else {
              // Token refresh failed, logout user
              set({ isRefreshing: false });
              await get().logout();
              return false;
            }
          } catch (error) {
            // Token refresh failed, logout user
            set({ isRefreshing: false });
            await get().logout();
            return false;
          }
        },

        // Update user profile
        updateProfile: async (updates: Partial<Player>): Promise<boolean> => {
          set({ isLoading: true, error: null });
          
          try {
            const response = await AuthService.updateProfile(updates);
            
            if (response.success && response.player) {
              set({
                user: response.player,
                isLoading: false,
                error: null,
              });
              return true;
            } else {
              set({
                isLoading: false,
                error: response.error || 'Profile update failed',
              });
              return false;
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Profile update failed';
            set({
              isLoading: false,
              error: errorMessage,
            });
            return false;
          }
        },

        // Clear error state
        clearError: () => {
          set({ error: null });
        },
      }),
      {
        name: 'dueled-auth',
        partialize: (state) => ({
          user: state.user,
          token: state.token,
          isAuthenticated: state.isAuthenticated,
          // Don't persist loading/refreshing states
        }),
      }
    ),
    {
      name: 'auth-store',
    }
  )
);

// Token refresh utility - can be called periodically
export const setupTokenRefresh = () => {
  // Start checking after a delay to allow initialization
  const initialDelay = setTimeout(() => {
    const { refreshToken, isAuthenticated } = useAuthStore.getState();
    
    if (isAuthenticated) {
      // Refresh token every 20 minutes (token expires in 24 hours)
      const refreshInterval = setInterval(() => {
        const currentState = useAuthStore.getState();
        if (currentState.isAuthenticated) {
          refreshToken().catch(error => {
            console.warn('Background token refresh failed:', error);
          });
        } else {
          clearInterval(refreshInterval);
        }
      }, 20 * 60 * 1000); // 20 minutes
      
      return () => {
        clearTimeout(initialDelay);
        clearInterval(refreshInterval);
      };
    }
  }, 2000); // Wait 2 seconds before starting refresh cycle
  
  return () => clearTimeout(initialDelay);
};