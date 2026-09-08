// Reuse the approved source. Only palette documentation and revision labels change.
import './preview.js';

document.title = `XForm — Precision Volt ${document.body.dataset.view}`;
document.querySelector('.artifact-header p span:last-child').textContent = 'PRECISION — VOLT';
document.querySelector('.revision').textContent = 'REVISION 03';
document.querySelector('.artifact-footer strong').textContent = 'Same design. Same typography. A new Volt palette.';

if (document.body.dataset.view === 'theme') {
  document.querySelector('.system-title .label').textContent = 'Precision / Volt theme pack';
  document.querySelector('.system-title p:not(.label)').innerHTML =
    'The approved layout and type. A new colour expression.<br>Neutral black. Crisp white. A focused volt-lime accent.';
  document.querySelector('.type-sample.old .label').textContent = 'Interface / IBM Plex Sans 500';
  document.querySelector('.type-sample.old small').textContent = 'Readable working type for daily coaching';
  document.querySelector('.type-sample.new .label').textContent = 'Display / Chakra Petch 700';
  document.querySelector('.component-section .section-heading span').textContent = 'Approved components retained';
  document.querySelector('.palette-section .section-heading h2').textContent = 'New palette. Same Precision.';
  document.querySelector('.palette-section .section-heading span').textContent = 'Volt colour system / 03';
  const swatches = [
    ['Carbon', '#090A0B'], ['Graphite', '#141719'], ['Chalk', '#F5F7F4'], ['Volt', '#C7F542'],
  ];
  document.querySelectorAll('.palette-row > div').forEach((card, index) => {
    const [name, hex] = swatches[index];
    card.querySelector('.swatch').style.backgroundColor = hex;
    card.querySelector('strong').textContent = name;
    card.querySelector('small').textContent = hex;
  });
}
