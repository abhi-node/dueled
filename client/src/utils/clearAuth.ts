/**
 * Utility to clear authentication state from localStorage
 * Useful for debugging auth issues
 */
export function clearAuthState() {
  // Clear auth-related items from localStorage
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  localStorage.removeItem('dueled-auth');
  
  // Clear any zustand persist storage
  const zustandStores = Object.keys(localStorage).filter(key => 
    key.includes('auth') || key.includes('dueled')
  );
  
  zustandStores.forEach(key => {
    localStorage.removeItem(key);
  });
  
  // Force page reload to reset all state
  window.location.reload();
}