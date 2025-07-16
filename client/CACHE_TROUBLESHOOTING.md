# Cache Troubleshooting Guide

## Common Caching Issues

If you experience issues where:
- Changes don't appear after reload
- Old code is still running
- UI appears broken after updates
- Assets fail to load properly

You're likely experiencing a caching issue. Here's how to resolve it:

## Quick Fixes (in order of effectiveness)

### 1. Browser Hard Reload
- **Chrome/Firefox**: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
- **Safari**: `Cmd+Option+R`

### 2. Close and Reopen Browser Tab
- Close the tab completely
- Reopen the URL in a new tab

### 3. Clear Browser Data
- Open Developer Tools (`F12`)
- Right-click refresh button → "Empty Cache and Hard Reload"
- Or: Chrome Settings → Privacy → Clear browsing data

### 4. Use Development Cache Tools
Open browser console and run:
```javascript
// Clear all caches (development only)
clearCaches()

// Check for service workers
checkCaches()

// Force reload with cache bypass
forceReload()
```

### 5. Clear Build Caches
Run these npm commands:
```bash
# Clear Vite build cache and restart
npm run dev:clean

# Or just clear cache without starting
npm run clear-cache
```

### 6. Nuclear Option - Clear Everything
```bash
# Stop dev server
# Clear all caches
rm -rf node_modules/.vite
rm -rf dist
rm -rf node_modules/.cache

# Clear browser data (manually)
# Restart dev server
npm run dev
```

## Why This Happens

### Browser Caching
- **Module Cache**: ES6 modules are aggressively cached
- **Memory Cache**: JavaScript stays in memory between reloads
- **Disk Cache**: Files cached to disk for performance

### Development Server Caching
- **Vite Cache**: Dependencies and transformed modules cached
- **Node Modules Cache**: Preprocessed files stored in `.vite` folder

### Service Workers
- Can serve stale content even after updates
- Require explicit cache invalidation

## Prevention Strategies

### For Developers
1. Use cache-busting in development (already implemented)
2. Clear caches between major changes
3. Use `dev:clean` script when switching branches

### For Users
1. Always try hard reload first
2. Close/reopen tabs for persistent issues
3. Clear browser data if problems persist

## Technical Implementation

This project includes several cache-busting measures:

1. **Vite Configuration**: Disabled caching headers in development
2. **Texture Loading**: Cache-busted URLs for assets
3. **Development Tools**: Helper functions for cache management
4. **Build Scripts**: Easy cache clearing commands

## Emergency Recovery

If the application becomes completely unresponsive:

1. Close all browser tabs
2. Clear browser data completely
3. Run `npm run clear-cache`
4. Restart dev server: `npm run dev:clean`
5. Open in incognito/private mode first

## Additional Notes

- Caching issues are more common during active development
- Production builds are less affected due to proper versioning
- Mobile browsers may have more aggressive caching
- Some issues resolve automatically after a few minutes