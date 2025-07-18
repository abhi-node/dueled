import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { MainMenu } from './components/lobby/MainMenu';
import { AuthPage } from './components/auth/AuthPage';
// GamePage removed in cleanup
import { MainGame } from './components/game/MainGame';
import { UserProfile } from './components/auth/UserProfile';
import { Navbar } from './components/common/Navbar';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { ToastContainer } from './components/common/Toast';
import { useAuthStore } from './store/authStore';
import { setupTokenRefresh } from './store/authStore';
import { AuthDebug } from './components/debug/AuthDebug';
import { ErrorBoundary } from './components/debug/ErrorBoundary';

function App() {
  const { initializeAuth } = useAuthStore();

  useEffect(() => {
    console.log('🚀 App: Initializing...');
    
    // Initialize authentication on app start
    initializeAuth();
    
    // Setup automatic token refresh
    const cleanup = setupTokenRefresh();
    
    console.log('✅ App: Initialization complete');
    
    return cleanup;
  }, [initializeAuth]);

  return (
    <ErrorBoundary>
      <Router>
        <div className="min-h-screen bg-arena-900">
          <Navbar />
          <main className="container mx-auto px-4 py-8">
            <Routes>
            {/* Public routes */}
            <Route 
              path="/" 
              element={
                <ProtectedRoute requireAuth={false}>
                  <MainMenu />
                </ProtectedRoute>
              } 
            />
            
            {/* Auth routes - accessible to everyone */}
            <Route 
              path="/auth" 
              element={<AuthPage />} 
            />
            
            {/* Protected routes - require authentication */}
            <Route 
              path="/game" 
              element={
                <ProtectedRoute requireAuth={true} fallbackPath="/auth">
                  <MainGame />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/game-old" 
              element={
                <ProtectedRoute requireAuth={true} fallbackPath="/auth">
                  <MainGame />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/profile" 
              element={
                <ProtectedRoute requireAuth={true} fallbackPath="/auth">
                  <UserProfile />
                </ProtectedRoute>
              } 
            />
            
            {/* Catch all route */}
            <Route 
              path="*" 
              element={
                <div className="text-center py-12">
                  <h1 className="text-2xl font-bold text-white mb-4">Page Not Found</h1>
                  <p className="text-arena-300 mb-6">The page you're looking for doesn't exist.</p>
                  <a href="/" className="btn-primary px-6 py-3">
                    Return Home
                  </a>
                </div>
              } 
            />
          </Routes>
        </main>
        
        {/* Global toast notifications */}
        <ToastContainer />
        
        {/* Debug component - remove in production */}
        <AuthDebug />
      </div>
    </Router>
    </ErrorBoundary>
  );
}

export default App;