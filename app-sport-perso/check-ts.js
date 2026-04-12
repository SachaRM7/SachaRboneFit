const { execSync } = require('child_process');
const path = require('path');

try {
  process.chdir('D:/Documents/SachaRboneFit/SachaRboneFit/app-sport-perso');
  const result = execSync('npx tsc --noEmit', { encoding: 'utf8', stdio: 'pipe' });
  console.log('STDOUT:', result);
} catch (error) {
  console.log('STDOUT:', error.stdout ? error.stdout.toString() : '');
  console.log('STDERR:', error.stderr ? error.stderr.toString() : '');
  console.log('EXIT CODE:', error.status);
}