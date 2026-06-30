const fs = require('fs');
const path = require('path');

const VALID_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const validPngBuffer = Buffer.from(VALID_PNG_BASE64, 'base64');

function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.png')) {
            fs.writeFileSync(fullPath, validPngBuffer);
            console.log("Fixed", fullPath);
        }
    }
}

walkDir(path.join(__dirname, 'android/app/src/main/res'));
