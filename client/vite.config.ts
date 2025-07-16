import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Disable caching during development
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    }
  },
  build: {
    // Enable source maps for debugging
    sourcemap: true,
    // Force chunking to prevent large bundle caching issues
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          game: ['phaser'],
          utils: ['socket.io-client']
        }
      }
    }
  },
  // Clear dependency cache on restarts
  optimizeDeps: {
    force: true
  }
})
