import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { CacheManager } from './utils/cacheUtils'

// Global error handler
window.addEventListener('error', (event) => {
  console.error('🚨 Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('🚨 Unhandled promise rejection:', event.reason);
});

console.log('🚀 Main: Starting app...');

// Initialize cache debugging in development
if (import.meta.env.DEV) {
  CacheManager.checkServiceWorkers();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

console.log('✅ Main: App rendered');
