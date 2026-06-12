// 构建脚本：拼接+压缩首屏脚本，懒加载页面脚本独立压缩
import { readFileSync, writeFileSync } from 'fs';
import { transform } from 'esbuild';

const PKG = JSON.parse(readFileSync('package.json', 'utf8'));
const BUILD_ID = process.env.BUILD_ID || Date.now().toString(36);

// ── 首屏 bundle：按依赖顺序拼接 → 压缩 ──
const MAIN_FILES = [
  'public/js/utils.js',
  'public/js/api.js',
  'public/js/pages/dashboard.js',
  'public/js/pages/settings.js',
  'public/js/app.js'
];

const mainCode = MAIN_FILES.map(f => readFileSync(f, 'utf8')).join('\n;\n');
const mainResult = await transform(mainCode, {
  minify: true, target: 'es2020', format: 'iife', loader: 'js',
  banner: `/* HSP v${PKG.version} (${BUILD_ID}) */`,
});
writeFileSync('public/js/bundle.js', mainResult.code);
console.log(`  bundle.js  ${(mainResult.code.length/1024).toFixed(1)} KB`);

// ── 懒加载页面脚本：各自独立压缩 ──
const pages = ['ddns','cert','nginx','port','cron','pm2','docker','ssh'];
for (const p of pages) {
  const src = readFileSync(`public/js/pages/${p}.js`, 'utf8');
  const result = await transform(src, {
    minify: true, target: 'es2020', format: 'iife', loader: 'js',
  });
  writeFileSync(`public/js/pages/${p}.min.js`, result.code);
  console.log(`  pages/${p}.min.js  ${(result.code.length/1024).toFixed(1)} KB`);
}

console.log(`\n✅ HSP v${PKG.version} bundle done (${BUILD_ID})`);
