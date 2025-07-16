import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { LoadingOverlay } from './Loading';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireAnonymous?: boolean;
  fallbackPath?: string;
}

/**
 * ProtectedRoute component that handles authentication guards
 * 
 * @param children - The component to render if access is allowed
 * @param requireAuth - If true, requires user to be authenticated
 * @param requireAnonymous - If true, requires user to NOT be authenticated (for auth pages)
 * @param fallbackPath - Path to redirect to if access is denied
 */
export function ProtectedRoute({ 
  children, 
  requireAuth = true, 
  requireAnonymous = false,
  fallbackPath 
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingOverlay message="Checking authentication..." />
      </div>
    );
  }

  // If route requires authentication but user is not authenticated
  if (requireAuth && !isAuthenticated) {
    const redirectPath = fallbackPath || '/auth';
    return <Navigate to={redirectPath} state={{ from: location }} replace />;
  }

  // If route requires anonymous access but user is authenticated
  if (requireAnonymous && isAuthenticated) {
    const redirectPath = fallbackPath || '/';
    return <Navigate to={redirectPath} replace />;
  }

  // If all checks pass, render the children
  return <>{children}</>;
}

/**
 * Hook to check if current user has required permissions
 */
export function useAuthGuard() {
  const { user, isAuthenticated } = useAuthStore();

  const checkPermission = (_permission: string): boolean => {
    if (!isAuthenticated || !user) {
      return false;
    }

    // For now, just check basic authentication
    // In the future, this could check user roles/permissions
    return true;
  };

  const requireAuth = (): boolean => {
    return isAuthenticated;
  };

  const requireAnonymous = (): boolean => {
    return !isAuthenticated;
  };

  const isGuest = (): boolean => {
    return user?.isAnonymous === true;
  };

  const isRegisteredUser = (): boolean => {
    return isAuthenticated && user?.isAnonymous === false;
  };

  return {
    checkPermission,
    requireAuth,
    requireAnonymous,
    isGuest,
    isRegisteredUser,
    user,
    isAuthenticated,
  };
}