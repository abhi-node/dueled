#!/usr/bin/env node

// Quick test script to verify the development environment setup
const { execSync } = require('child_process');
const path = require('path');

// Change to the project root directory
const projectRoot = path.join(__dirname, '..');
process.chdir(projectRoot);

console.log('🧪 Testing Dueled Development Environment Setup\n');
console.log(`Working directory: ${process.cwd()}\n`);

// Test 1: Check if Docker containers are running
console.log('1️⃣ Checking Docker containers...');
try {
  const dockerStatus = execSync('./scripts/docker-dev.sh status', { encoding: 'utf8' });
  if (dockerStatus.includes('healthy')) {
    console.log('✅ Docker containers are healthy\n');
  } else {
    console.log('❌ Docker containers are not healthy\n');
  }
} catch (error) {
  console.log('❌ Docker containers are not running\n');
}

// Test 2: Check if we can connect to PostgreSQL
console.log('2️⃣ Testing PostgreSQL connection...');
try {
  execSync('./scripts/docker-dev.sh test', { encoding: 'utf8' });
  console.log('✅ PostgreSQL connection successful\n');
} catch (error) {
  console.log('❌ PostgreSQL connection failed\n');
}

// Test 3: Check if shared package builds
console.log('3️⃣ Testing shared package build...');
try {
  execSync('cd shared && npm run build', { encoding: 'utf8' });
  console.log('✅ Shared package builds successfully\n');
} catch (error) {
  console.log('❌ Shared package build failed\n');
}

// Test 4: Check if server builds
console.log('4️⃣ Testing server build...');
try {
  execSync('cd server && npm run build', { encoding: 'utf8' });
  console.log('✅ Server builds successfully\n');
} catch (error) {
  console.log('❌ Server build failed\n');
}

console.log('🎉 Development environment setup test complete!');
console.log('\n📝 Next steps:');
console.log('   npm run dev     - Start full development environment');
console.log('   npm run docker:logs - View container logs');
console.log('   npm run docker:stop - Stop containers when done');