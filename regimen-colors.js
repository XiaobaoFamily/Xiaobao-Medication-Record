// Encode the prescribed schedule as a normalized daily average. The scale is
// fixed per drug, so filtering dates cannot change the meaning of a color.
const scales = {
  Fluticasone: { unit: 'mcg', reference: 220, light: [239, 248, 252], dark: [80, 139, 176] },
  Prednisolone: { unit: 'mg', reference: 2.5, light: [255, 245, 228], dark: [190, 123, 50] },
};

function dosesPerDay(frequency) {
  if (frequency === 'QD') return 1;
  if (frequency === 'BID') return 2;
  if (frequency === 'TID') return 3;
  if (frequency === 'q48h') return .5;
  let match = frequency.match(/^q(\d+)d$/i);
  if (match) return +match[1] ? 1 / +match[1] : null;
  match = frequency.match(/^(\d+)\/day$/i);
  if (match) return +match[1] || null;
  match = frequency.match(/^(\d+) doses\/(\d+) days$/i);
  return match && +match[1] && +match[2] ? +match[1] / +match[2] : null;
}

export function regimenColor(medicine, label) {
  const scale = scales[medicine];
  const unknown = { fill: '#ffffff', status: 'unknown', dailyAverage: null };
  if (!scale || typeof label !== 'string') return unknown;
  const dailyAmounts = label.split(' / ').map(part => {
    const match = part.match(/^\s*(\d+(?:\.\d+)?)\s+([a-z]+)\s+(.+?)\s*$/i);
    if (!match || match[2].toLowerCase() !== scale.unit) return null;
    const dose = Number(match[1]), frequency = dosesPerDay(match[3]);
    return Number.isFinite(dose) && dose > 0 && frequency ? dose * frequency : null;
  });
  if (dailyAmounts.some(d => d === null)) return unknown;
  // Multiple recorded regimens have no known time weighting. Their color uses
  // a simple mean of their schedule equivalents, identified as such on chart.
  const dailyAverage = dailyAmounts.reduce((sum, value) => sum + value, 0) / dailyAmounts.length;
  const intensity = .5 + Math.atan(Math.log2(dailyAverage / scale.reference)) / Math.PI;
  const rgb = scale.light.map((value, i) => Math.round(value + (scale.dark[i] - value) * intensity));
  return { fill: `#${rgb.map(value => value.toString(16).padStart(2, '0')).join('')}`,
    status: dailyAmounts.length > 1 ? 'mixed' : 'single', dailyAverage, unit: scale.unit };
}
