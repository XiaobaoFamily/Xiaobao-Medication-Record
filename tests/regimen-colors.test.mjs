import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../regimen-colors.js', import.meta.url), 'utf8');
const { regimenColor } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const luminance = hex => {
  const rgb = hex.match(/[0-9a-f]{2}/gi).map(channel => parseInt(channel, 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
};
const equivalents = [
  ['Fluticasone', '110 mcg QD', 110], ['Fluticasone', '110 mcg BID', 220],
  ['Fluticasone', '110 mcg TID', 330], ['Fluticasone', '220 mcg BID', 440],
  ['Prednisolone', '5 mg QD', 5], ['Prednisolone', '5 mg q48h', 2.5],
  ['Prednisolone', '5 mg q3d', 5 / 3], ['Prednisolone', '5 mg 2 doses/3 days', 10 / 3],
  ['Prednisolone', '5 mg 4/day', 20],
];
for (const [medicine, label, expected] of equivalents) {
  const result = regimenColor(medicine, label);
  assert.equal(result.status, 'single');
  assert(Math.abs(result.dailyAverage - expected) < 1e-10, label);
  assert((luminance(result.fill) + .05) / .05 >= 4.5, 'Dark labels remain legible');
}
const color = (medicine, label) => regimenColor(medicine, label).fill;
assert(luminance(color('Fluticasone', '110 mcg TID')) < luminance(color('Fluticasone', '110 mcg BID')));
assert(luminance(color('Prednisolone', '5 mg QD')) < luminance(color('Prednisolone', '5 mg q48h')));
assert.equal(color('Prednisolone', '5 mg q48h'), color('Prednisolone', '2.5 mg QD'));
const mixed = regimenColor('Fluticasone', '220 mcg BID / 110 mcg BID');
assert.equal(mixed.status, 'mixed');assert.equal(mixed.dailyAverage, 330);
assert.equal(mixed.fill, color('Fluticasone', '110 mcg TID'));
for (const label of ['? mcg BID', '110 wrongunit BID', '0 mcg QD', '110 mcg Frequency unspecified', '110 mcg q0d', '110 mcg 0/day', '110 mcg BID / ? mcg QD']) {
  const result = regimenColor('Fluticasone', label);
  assert.equal(result.status, 'unknown', label);assert.equal(result.fill, '#ffffff');assert.equal(result.dailyAverage, null);
}
assert.equal(regimenColor('Unknown medicine', '110 mcg BID').status, 'unknown');
console.log('Regimen daily-average color checks passed.');
