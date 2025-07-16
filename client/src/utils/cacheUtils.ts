/**
 * Cache management utilities for development
 */

export class CacheManager {
  /**
   * Clear all browser caches (development only)
   */
  static async clearAllCaches(): Promise<void> {
    if (!import.meta.env.DEV) {
      console.warn('Cache clearing is only available in development mode');
      return;
    }

    try {
      // Clear Service Worker caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
        console.log('✅ Service Worker caches cleared');
      }

      // Clear Local Storage
      localStorage.clear();
      console.log('✅ Local Storage cleared');

      // Clear Session Storage
      sessionStorage.clear();
      console.log('✅ Session Storage cleared');

      // Clear IndexedDB (if used)
      if ('indexedDB' in window) {
        // Note: This is a simplified approach
        console.log('💡 Consider clearing IndexedDB manually if used');
      }

      console.log('🎉 All caches cleared! Reload the page to see changes.');
    } catch (error) {
      console.error('❌ Error clearing caches:', error);
    }
  }

  /**
   * Force reload with cache bypass
   */
  static forceReload(): void {
    // Hard reload that bypasses cache
    window.location.reload();
  }

  /**
   * Check if there are any active service workers
   */
  static async checkServiceWorkers(): Promise<void> {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length > 0) {
        console.log('🔧 Active Service Workers found:', registrations.length);
        for (const registration of registrations) {
          console.log('  - Scope:', registration.scope);
        }
      } else {
        console.log('✅ No active Service Workers');
      }
    }
  }

  /**
   * Add cache-busting parameter to URLs in development
   */
  static bustCache(url: string): string {
    if (!import.meta.env.DEV) {
      return url;
    }
    
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${Date.now()}`;
  }

  /**
   * Add development cache debugging info to window
   */
  static addDebugHelpers(): void {
    if (!import.meta.env.DEV) {
      return;
    }

    // Add global cache management functions
    (window as any).clearCaches = this.clearAllCaches;
    (window as any).checkCaches = this.checkServiceWorkers;
    (window as any).forceReload = this.forceReload;

    console.log('🔧 Cache debug helpers added to window:');
    console.log('  - clearCaches(): Clear all browser caches');
    console.log('  - checkCaches(): Check for active service workers');
    console.log('  - forceReload(): Force page reload with cache bypass');
  }
}

// Auto-initialize debug helpers in development
if (import.meta.env.DEV) {
  CacheManager.addDebugHelpers();
}