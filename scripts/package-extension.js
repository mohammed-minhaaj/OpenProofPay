import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const extensionDir = path.join(rootDir, 'apps', 'extension');
const extensionDist = path.join(extensionDir, 'dist');
const outputDir = path.join(rootDir, 'dist');
const zipFilePath = path.join(outputDir, 'openproofpay-extension.zip');

console.log('🚀 [Package Extension] Building @openproofpay/extension for production...');

try {
  // 1. Build the Chrome Extension bundle
  execSync('npm --workspace=@openproofpay/extension run build', {
    cwd: rootDir,
    stdio: 'inherit'
  });

  // 2. Verify dist and manifest.json existence
  const manifestPath = path.join(extensionDist, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}. Build failed or incomplete.`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`✅ [Package Extension] Verified manifest.json (v${manifest.version}, MV${manifest.manifest_version})`);

  // 3. Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Remove existing zip if present
  if (fs.existsSync(zipFilePath)) {
    fs.unlinkSync(zipFilePath);
  }

  // 4. Archive dist contents into zip
  console.log('📦 [Package Extension] Creating Chrome Web Store-ready zip archive...');
  // Execute zip inside extensionDist so files are relative to root in zip
  execSync(`cd "${extensionDist}" && zip -r "${zipFilePath}" . -x "*.DS_Store"`, {
    stdio: 'inherit'
  });

  const stats = fs.statSync(zipFilePath);
  const sizeKb = (stats.size / 1024).toFixed(2);

  console.log(`🎉 [Package Extension] Successfully created zip artifact:`);
  console.log(`   Path: ${zipFilePath}`);
  console.log(`   Size: ${sizeKb} KB`);
  console.log(`   Ready for Chrome Web Store Developer Dashboard upload or Developer Mode loading!`);
} catch (error) {
  console.error('❌ [Package Extension] Packaging failed:', error);
  process.exit(1);
}
