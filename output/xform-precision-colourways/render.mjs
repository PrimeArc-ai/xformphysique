import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { palettes } from './palettes.js';

const root = dirname(fileURLToPath(import.meta.url));
const mime = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.woff2':'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, path === '/' ? 'index.html' : `.${path}`);
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });

const luminance = hex => {
  const v = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255)
    .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
  return v[0] * .2126 + v[1] * .7152 + v[2] * .0722;
};
const pairs = [['ink','bg'], ['ink','surface'], ['muted','surface'], ['muted','raised'], ['accent','surface'], ['accent','selected'], ['button-ink','primary']];
const contrast = palettes.map(palette => ({ palette: palette.id, pairs: pairs.map(([fg, bg]) => {
  const a = luminance(palette.tokens[fg]), b = luminance(palette.tokens[bg]);
  const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  assert.ok(ratio >= 4.5, `${palette.id}: ${fg}/${bg} contrast too low (${ratio})`);
  return { foreground: fg, background: bg, ratio: Number(ratio.toFixed(2)), passesNormalTextAA: true };
}) }));

const snapshot = scope => [document.querySelector(scope), ...document.querySelectorAll(`${scope} *`)].map(el => {
  const r = el.getBoundingClientRect(), s = getComputedStyle(el);
  return { tag: el.tagName, classes: el.getAttribute('class'), text: el.children.length ? null : el.textContent,
    rect: [r.x, r.y, r.width, r.height], font: [s.fontFamily, s.fontSize, s.fontWeight, s.lineHeight, s.letterSpacing],
    shape: [s.borderRadius, s.clipPath] };
});

let browser;
const results = [], firstSnapshots = {};
try {
  browser = await chromium.launch({ headless: true });
  for (const palette of palettes) for (const view of ['dashboard', 'theme']) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 });
    const errors = [], external = [], failed = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:')) external.push(req.url()); });
    page.on('requestfailed', req => failed.push(req.url()));
    page.on('response', res => { if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`); });
    await page.goto(`http://127.0.0.1:${server.address().port}/?palette=${palette.id}&view=${view}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const evidence = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => ({ family: f.family, weight: f.weight })),
        tokens: Object.fromEntries(['bg','surface','raised','border','ink','muted','accent','primary','button-ink','selected'].map(key => [key, style.getPropertyValue(`--${key}`).trim()])),
        clipped: [...document.querySelectorAll('.app-frame,.app-main,.app-content,.body-panel,.training-card,.training-body,.theme-system,.signin,.signin-body,.type-sample,.component-box')]
          .filter(el => el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)
          .map(el => ({ class: el.className, box: [el.clientWidth,el.clientHeight], scroll: [el.scrollWidth,el.scrollHeight] })),
        escaped: [...document.querySelectorAll('.artifact *')].filter(el => {
          const r = el.getBoundingClientRect(); return r.left < 0 || r.top < 0 || r.right > 1601 || r.bottom > 1101;
        }).map(el => el.className.baseVal || el.className),
      };
    });
    const file = `${palette.number}-${palette.id}-${view}.png`;
    await page.screenshot({ path: resolve(root, file) });
    const missing = ['Sora', 'IBM Plex Sans', 'IBM Plex Mono'].filter(name => !evidence.fonts.some(f => f.family.replaceAll('"', '') === name));
    assert.deepEqual({ errors, external, failed, missing, clipped: evidence.clipped, escaped: evidence.escaped, width: evidence.width, height: evidence.height },
      { errors: [], external: [], failed: [], missing: [], clipped: [], escaped: [], width: 1600, height: 1100 }, `${file} failed rendering checks`);
    assert.ok(!evidence.fonts.some(f => f.family.includes('Chakra')), 'Unexpected Chakra Petch font');
    const scope = view === 'dashboard' ? '.app-frame' : '.signin';
    const current = await page.evaluate(snapshot, scope);
    firstSnapshots[view] ??= current;
    assert.deepEqual(current, firstSnapshots[view], `Layout or typography differs between palettes: ${file}`);
    results.push({ file, pixels: [3200,2200], errors, external, failed, missing, sameGeometryAndTypographyAcrossPalettes: true, ...evidence });
    console.log(`${file}: fonts loaded; no clipping; consistent composition.`);
    await page.close();
  }
  const sourceHashes = [];
  for (const file of ['theme.css', 'preview.js', 'assets/strength-editorial.png']) {
    const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
    const current = await hash(resolve(root, file));
    assert.equal(current, await hash(resolve(root, '../xform-precision-v2', file)));
    sourceHashes.push({ file, sha256: current, originalSourcePreserved: true });
  }
  await writeFile(resolve(root, 'render-evidence.json'), JSON.stringify(results, null, 2) + '\n');
  await writeFile(resolve(root, 'validation.json'), JSON.stringify({ contrast, sourceHashes, note: 'Selected text pairs only; not a complete accessibility audit.' }, null, 2) + '\n');
  console.log('Six previews rendered. All selected text pairs meet 4.5:1; original design sources preserved.');
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
