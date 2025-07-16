import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useAuthGuard } from './ProtectedRoute';

export function Navbar() {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { logout } = useAuthStore();
  const { isAuthenticated, user, isGuest } = useAuthGuard();

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  return (
    <nav className="bg-arena-800 border-b border-arena-600">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="text-2xl font-bold text-dueled-500 font-game">
            DUELED
          </Link>
          
          <div className="flex items-center space-x-4">
            <Link 
              to="/" 
              className="text-arena-300 hover:text-white transition-colors"
            >
              Home
            </Link>
            
            {isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-2 text-arena-300 hover:text-white transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-dueled-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-bold">
                        {user?.username?.[0]?.toUpperCase() || 'U'}
                      </span>
                    </div>
                    <span className="hidden md:block">{user?.username}</span>
                    {isGuest && (
                      <span className="bg-yellow-900 text-yellow-300 px-2 py-1 rounded text-xs">
                        Guest
                      </span>
                    )}
                  </div>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-arena-700 rounded-md shadow-lg border border-arena-600 z-50">
                    <div className="py-1">
                      <div className="px-4 py-2 border-b border-arena-600">
                        <p className="text-sm text-white font-medium">{user?.username}</p>
                        <p className="text-xs text-arena-400">
                          Rating: {user?.rating || 1000}
                        </p>
                      </div>
                      
                      {!isGuest && (
                        <Link
                          to="/profile"
                          className="block px-4 py-2 text-sm text-arena-300 hover:text-white hover:bg-arena-600 transition-colors"
                          onClick={() => setShowUserMenu(false)}
                        >
                          Profile Settings
                        </Link>
                      )}
                      
                      <Link
                        to="/game"
                        className="block px-4 py-2 text-sm text-arena-300 hover:text-white hover:bg-arena-600 transition-colors"
                        onClick={() => setShowUserMenu(false)}
                      >
                        Enter Arena
                      </Link>
                      
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-arena-600 transition-colors"
                      >
                        {isGuest ? 'End Session' : 'Logout'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link 
                to="/auth" 
                className="btn-primary px-4 py-2"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Backdrop to close user menu */}
      {showUserMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </nav>
  );
}