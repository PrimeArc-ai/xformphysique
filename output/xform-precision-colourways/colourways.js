import { palettes } from './palettes.js';
import './preview.js';

const requested = new URLSearchParams(location.search).get('palette');
const palette = palettes.find(item => item.id === requested) || palettes[0];
document.documentElement.dataset.palette = palette.id;
for (const [token, value] of Object.entries(palette.tokens)) {
  document.documentElement.style.setProperty(`--${token}`, value);
}
document.title = `XForm — Precision ${palette.name} / ${document.body.dataset.view}`;
document.querySelector('.artifact-header p span:last-child').textContent = `PRECISION / ${palette.name.toUpperCase()}`;
document.querySelector('.revision').textContent = `OPTION ${palette.number}`;
document.querySelector('.artifact-footer strong').textContent = `${palette.name} · Sora + IBM Plex · ${palette.description}`;
document.querySelector('.artifact-footer > span:last-child').textContent = 'Design study only · Synthetic data · Live app unchanged';

if (document.body.dataset.view === 'theme') {
  document.querySelector('.system-title .label').textContent = `Precision / ${palette.name} theme pack`;
  document.querySelector('.system-title p:not(.label)').innerHTML = `${palette.description}<br>${palette.character}`;
  document.querySelector('.type-sample.old .label').textContent = 'Interface / IBM Plex Sans 500';
  document.querySelector('.type-sample.old small').textContent = 'Readable copy for everyday coaching';
  document.querySelector('.type-sample.new .label').textContent = 'Display / Sora 600';
  document.querySelector('.type-sample.new small').textContent = 'Confident geometry. Brighter colour contrast.';
  document.querySelector('.component-section .section-heading span').textContent = 'Strong actions. Clear hierarchy.';
  document.querySelector('.palette-section .section-heading h2').textContent = 'A complete dark colour system';
  document.querySelector('.palette-section .section-heading span').textContent = 'Action fill ≠ text accent';
  document.querySelectorAll('.palette-row > div').forEach((card, index) => {
    const [name, token] = palette.swatches[index];
    card.querySelector('.swatch').style.backgroundColor = palette.tokens[token];
    card.querySelector('strong').textContent = name;
    card.querySelector('small').textContent = palette.tokens[token];
  });
  document.querySelector('.theme-spec > div:first-child').innerHTML = '<strong>Display + metrics</strong>Sora 600–700<br>Same typography across all packs.';
  document.querySelector('.theme-spec > div:nth-child(2)').innerHTML = '<strong>Body + data labels</strong>IBM Plex Sans / Plex Mono<br>Quiet, readable supporting type.';
}
