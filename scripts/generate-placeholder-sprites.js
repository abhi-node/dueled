/**
 * Generate placeholder sprite sheets for testing
 * Creates 192x192 sprite sheets with 4x4 grid of 48x48 sprites
 * Each class gets different colored sprites for easy identification
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

// Class configurations
const classConfigs = {
  berserker: { color: '#ff4444', name: 'Berserker' },
  mage: { color: '#4444ff', name: 'Mage' },
  bomber: { color: '#ff8800', name: 'Bomber' },
  archer: { color: '#44ff44', name: 'Archer' }
};

// Sprite sheet configuration
const SHEET_SIZE = 192;
const SPRITE_SIZE = 48;
const GRID_SIZE = 4;

/**
 * Generate a single sprite frame
 */
function generateSprite(color, row, col) {
  const canvas = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
  const ctx = canvas.getContext('2d');
  
  // Clear with transparent background
  ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  
  // Draw a simple character representation
  const centerX = SPRITE_SIZE / 2;
  const centerY = SPRITE_SIZE / 2;
  const radius = SPRITE_SIZE / 3;
  
  // Body (circle)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  
  // Add directional indicator based on row
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  let dirChar = '';
  switch(row) {
    case 0: dirChar = '↑'; break; // Forward
    case 1: dirChar = '→'; break; // Right
    case 2: dirChar = '↓'; break; // Backward
    case 3: dirChar = '←'; break; // Left
  }
  
  ctx.fillText(dirChar, centerX, centerY);
  
  // Add frame number
  ctx.fillStyle = '#000000';
  ctx.font = '8px Arial';
  ctx.fillText(col.toString(), centerX, centerY + radius - 5);
  
  return canvas;
}

/**
 * Generate a complete sprite sheet for a class
 */
function generateSpriteSheet(classType, config) {
  const canvas = createCanvas(SHEET_SIZE, SHEET_SIZE);
  const ctx = canvas.getContext('2d');
  
  // Clear canvas
  ctx.clearRect(0, 0, SHEET_SIZE, SHEET_SIZE);
  
  // Generate each sprite in the 4x4 grid
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const spriteCanvas = generateSprite(config.color, row, col);
      const x = col * SPRITE_SIZE;
      const y = row * SPRITE_SIZE;
      
      ctx.drawImage(spriteCanvas, x, y);
    }
  }
  
  return canvas;
}

/**
 * Save canvas as PNG file
 */
function saveCanvas(canvas, filePath) {
  const buffer = canvas.toBuffer('image/png');
  
  // Ensure directory exists
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  
  // Write file
  fs.writeFileSync(filePath, buffer);
  console.log(`Generated: ${filePath}`);
}

/**
 * Main function to generate all sprite sheets
 */
function generateAllSprites() {
  console.log('Generating placeholder sprite sheets...');
  
  const baseDir = path.join(__dirname, '..', 'public', 'assets', 'sprites', 'players');
  
  for (const [classType, config] of Object.entries(classConfigs)) {
    console.log(`\nGenerating sprites for ${config.name}...`);
    
    // Generate walk sprite sheet
    const spriteSheet = generateSpriteSheet(classType, config);
    const filePath = path.join(baseDir, classType, `${classType}_walk.png`);
    
    saveCanvas(spriteSheet, filePath);
  }
  
  console.log('\n✅ All placeholder sprite sheets generated successfully!');
  console.log('\nSprite sheet format:');
  console.log('- Size: 192x192 pixels');
  console.log('- Grid: 4x4 sprites');
  console.log('- Sprite size: 48x48 pixels each');
  console.log('- Row 0: Walking forward (↑)');
  console.log('- Row 1: Walking right (→)');
  console.log('- Row 2: Walking backward (↓)');
  console.log('- Row 3: Walking left (←)');
  console.log('- Columns 0-3: Animation frames');
}

// Check if canvas package is available
try {
  require('canvas');
  generateAllSprites();
} catch (error) {
  console.log('\n⚠️  Canvas package not available. Cannot generate placeholder sprites.');
  console.log('To generate placeholder sprites, install the canvas package:');
  console.log('npm install canvas');
  console.log('\nFor now, the sprite system will fall back to colored circles.');
}