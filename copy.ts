import fs from 'fs';
import path from 'path';

const src = path.join(process.cwd(), 'public/sos_alarm.mp3');
const destDir = path.join(process.cwd(), 'android/app/src/main/res/raw');
const dest = path.join(destDir, 'sos_alarm.mp3');

if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

fs.copyFileSync(src, dest);
console.log('copied');
