import { useAuthStore } from '../../store/authStore';
import { useLocation, useNavigate } from 'react-router-dom';
import { clearAuthState } from '../../utils/clearAuth';

export function AuthDebug() {
  const { user, isAuthenticated, token } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 text-white p-4 rounded-lg shadow-lg max-w-xs z-50 text-sm">
      <h3 className="font-bold mb-2">🐛 Auth Debug</h3>
      <div className="space-y-1">
        <div>Path: <span className="text-yellow-400">{location.pathname}</span></div>
        <div>Is Authenticated: <span className={isAuthenticated ? 'text-green-400' : 'text-red-400'}>{isAuthenticated ? 'Yes' : 'No'}</span></div>
        {user && (
          <>
            <div>Username: <span className="text-blue-400">{user.username}</span></div>
            <div>Is Guest: <span className="text-purple-400">{user.isAnonymous ? 'Yes' : 'No'}</span></div>
          </>
        )}
        <div>Token: <span className="text-gray-400">{token ? 'Present' : 'None'}</span></div>
      </div>
      
      <div className="mt-3 space-y-2">
        <button
          onClick={() => navigate('/auth')}
          className="w-full bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs"
        >
          Navigate to /auth
        </button>
        <button
          onClick={() => navigate('/')}
          className="w-full bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs"
        >
          Navigate to Home
        </button>
        <button
          onClick={clearAuthState}
          className="w-full bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs"
        >
          Clear Auth & Reload
        </button>
      </div>
      
      <div className="mt-3 text-xs text-gray-400">
        <div>LocalStorage Keys:</div>
        <div className="text-xs">
          {Object.keys(localStorage).filter(k => k.includes('auth') || k.includes('dueled')).join(', ') || 'None'}
        </div>
      </div>
    </div>
  );
}