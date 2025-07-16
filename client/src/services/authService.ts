import axios, { AxiosError } from 'axios';
import type { AuthRequest, AuthResponse, Player } from '@dueled/shared';

// Configure axios instance for API calls
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Clear invalid token
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  }
);

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterCredentials {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}

export class AuthService {
  /**
   * Login user with username and password
   */
  static async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await api.post<AuthResponse>('/api/auth/login', credentials);
      
      if (response.data.success && response.data.token && response.data.player) {
        this.storeAuthData(response.data.token, response.data.player);
      }
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        return error.response.data as AuthResponse;
      }
      throw new Error('Network error occurred during login');
    }
  }

  /**
   * Register new user account
   */
  static async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    try {
      const response = await api.post<AuthResponse>('/api/auth/register', credentials);
      
      if (response.data.success && response.data.token && response.data.player) {
        this.storeAuthData(response.data.token, response.data.player);
      }
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        return error.response.data as AuthResponse;
      }
      throw new Error('Network error occurred during registration');
    }
  }

  /**
   * Create anonymous session for guest play
   */
  static async createAnonymousSession(): Promise<AuthResponse> {
    try {
      const response = await api.post<AuthResponse>('/api/auth/anonymous');
      
      if (response.data.success && response.data.token && response.data.player) {
        this.storeAuthData(response.data.token, response.data.player);
      }
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        return error.response.data as AuthResponse;
      }
      throw new Error('Network error occurred while creating anonymous session');
    }
  }

  /**
   * Request password reset email
   */
  static async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post('/api/auth/password-reset', { email });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        return error.response.data;
      }
      throw new Error('Network error occurred during password reset request');
    }
  }

  /**
   * Confirm password reset with token
   */
  static async confirmPasswordReset(data: PasswordResetConfirm): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post('/api/auth/password-reset/confirm', data);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        return error.response.data;
      }
      throw new Error('Network error occurred during password reset confirmation');
    }
  }

  /**
   * Refresh authentication token
   */
  static async refreshToken(): Promise<AuthResponse> {
    try {
      const response = await api.post<AuthResponse>('/api/auth/refresh');
      
      if (response.data.success && response.data.token && response.data.player) {
        this.storeAuthData(response.data.token, response.data.player);
      }
      
      return response.data;
    } catch (error) {
      this.clearAuthData();
      if (axios.isAxiosError(error) && error.response?.data) {
        return error.response.data as AuthResponse;
      }
      throw new Error('Network error occurred during token refresh');
    }
  }

  /**
   * Logout user and clear stored data
   */
  static async logout(): Promise<void> {
    try {
      await api.post('/api/auth/logout');
    } catch (error) {
      // Ignore logout errors - clear local data anyway
      console.warn('Logout request failed:', error);
    } finally {
      this.clearAuthData();
    }
  }

  /**
   * Get current user profile
   */
  static async getCurrentUser(): Promise<Player | null> {
    try {
      const response = await api.get<{ success: boolean; player: Player }>('/api/auth/me');
      
      if (response.data.success && response.data.player) {
        // Update stored user data
        localStorage.setItem('user', JSON.stringify(response.data.player));
        return response.data.player;
      }
      
      return null;
    } catch (error) {
      console.warn('Failed to fetch current user:', error);
      return null;
    }
  }

  /**
   * Update user profile
   */
  static async updateProfile(updates: Partial<Player>): Promise<{ success: boolean; player?: Player; error?: string }> {
    try {
      const response = await api.put('/api/auth/profile', updates);
      
      if (response.data.success && response.data.player) {
        // Update stored user data
        localStorage.setItem('user', JSON.stringify(response.data.player));
      }
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        return error.response.data;
      }
      throw new Error('Network error occurred during profile update');
    }
  }

  /**
   * Check if user is authenticated
   */
  static isAuthenticated(): boolean {
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('user');
    return !!(token && user);
  }

  /**
   * Get stored authentication token
   */
  static getToken(): string | null {
    return localStorage.getItem('authToken');
  }

  /**
   * Get stored user data
   */
  static getStoredUser(): Player | null {
    try {
      const userData = localStorage.getItem('user');
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.warn('Failed to parse stored user data:', error);
      return null;
    }
  }

  /**
   * Store authentication data in localStorage
   */
  private static storeAuthData(token: string, user: Player): void {
    localStorage.setItem('authToken', token);
    localStorage.setItem('user', JSON.stringify(user));
  }

  /**
   * Clear stored authentication data
   */
  private static clearAuthData(): void {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  }

  /**
   * Validate password strength
   */
  static validatePassword(password: string): {
    isValid: boolean;
    score: number;
    feedback: string[];
  } {
    const feedback: string[] = [];
    let score = 0;

    // Must be at least 8 characters to match server requirements
    if (password.length < 8) {
      feedback.push('Password must be at least 8 characters long');
      return {
        isValid: false,
        score: 0,
        feedback,
      };
    } else {
      score += 1;
    }

    let hasRequirements = true;

    // Check for lowercase letter (required by server)
    if (!/[a-z]/.test(password)) {
      feedback.push('Must contain at least one lowercase letter');
      hasRequirements = false;
    } else {
      score += 1;
    }

    // Check for uppercase letter (required by server)
    if (!/[A-Z]/.test(password)) {
      feedback.push('Must contain at least one uppercase letter');
      hasRequirements = false;
    } else {
      score += 1;
    }

    // Check for number (required by server)
    if (!/[0-9]/.test(password)) {
      feedback.push('Must contain at least one number');
      hasRequirements = false;
    } else {
      score += 1;
    }

    // Special characters are bonus (not required by server)
    if (/[^A-Za-z0-9]/.test(password)) {
      score += 1;
    }

    const isValid = password.length >= 8 && hasRequirements;

    return {
      isValid,
      score: Math.min(score, 4),
      feedback,
    };
  }
}

export default AuthService;