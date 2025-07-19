# Testing the WebGL Renderer

## Quick Test Steps

1. **Server is already running** on port 3000 (from npm run dev)
2. **Client is already running** on port 5174

## Testing the Renderer:

1. Open http://localhost:5174 in your browser
2. Click "Demo Login"
3. Select a class (e.g., Berserker)
4. Click "Find Match"
5. Wait for matchmaking (should be instant since it creates a match with yourself)
6. The game should load and you should see:
   - A 3D raycasted view from your player's perspective
   - Walls rendered as brown/tan blocks
   - Floor as gray
   - Ceiling as dark blue
   - Your position should be shown in debug logs

## Expected Behavior:

- **If working correctly**: You'll see a first-person 3D view with walls, floor, and ceiling
- **Current issue**: Only seeing dark blue screen means WebGL context or shader issues

## Debug Steps:

1. Open browser console (F12)
2. Look for:
   - "✅ GameRenderer initialized"
   - "🎨 SimpleRenderer.render() called"
   - Any WebGL errors
3. Check for shader compilation errors
4. Look for "hasLocalPlayer: true" in the logs

## Controls (once rendering works):

- Click canvas to enable mouse look
- WASD to move
- Shift to sprint
- Left click to attack
- Right click for special ability
- Space to dash