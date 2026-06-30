const { execSync } = require('child_process');
try {
  execSync('cd android && chmod +x ./gradlew && ./gradlew assembleDebug', { stdio: 'inherit' });
} catch (e) {
  console.error(e);
  process.exit(1);
}
