// 构建脚本：拼接+压缩首屏脚本，懒加载页面脚本独立压缩
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { transform } from 'esbuild';

const PKG = JSON.parse(readFileSync('package.json', 'utf8'));
const BUILD_ID = process.env.BUILD_ID || Date.now().toString(36);

// ── 前置校验：数据库 Schema 一致性 ──
try {
  execSync('node scripts/validate-schema.js --quiet', { stdio: 'pipe' });
} catch (e) {
  console.error('\n❌ Schema 校验失败，构建中止。请修复差异后重试。\n');
  console.error(e.stderr?.toString() || e.stdout?.toString() || e.message);
  process.exit(1);
}
console.log('  ✅ Schema 校验通过\n');

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
const pages = ['ddns','cert','nginx','port','cron','pm2','docker','ssh','devices'];
for (const p of pages) {
  const src = readFileSync(`public/js/pages/${p}.js`, 'utf8');
  const result = await transform(src, {
    minify: true, target: 'es2020', format: 'iife', loader: 'js',
  });
  writeFileSync(`public/js/pages/${p}.min.js`, result.code);
  console.log(`  pages/${p}.min.js  ${(result.code.length/1024).toFixed(1)} KB`);
}

// ── 更新 public/index.html 中所有 cache-busting v= 参数 ──
let indexHtml = readFileSync('public/index.html', 'utf8');
indexHtml = indexHtml.replace(/\.(js|css|min\.js)\?v=[a-z0-9]+/g, '.$1?v=' + BUILD_ID);
writeFileSync('public/index.html', indexHtml);

console.log(`\n✅ HSP v${PKG.version} bundle done (${BUILD_ID})`);
