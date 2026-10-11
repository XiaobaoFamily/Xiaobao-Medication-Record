const clock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function chicagoParts(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(clock.formatToParts(date).map(({ type, value }) => [type, value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: +parts.hour + +parts.minute / 60,
    time: `${parts.hour}:${parts.minute}` };
}

export const dateNumber = (date) => Date.parse(`${date}T00:00:00Z`) / 86400000;
export const dayString = (number) => new Date(number * 86400000).toISOString().slice(0, 10);

// Count ranges describe the caregiver's wording, not a measured severity score.
export function parseCough(note = '', id = '') {
  if (!/咳|cough/i.test(note) || /因咳嗽就诊|(?:无|没有|未见|不再)咳嗽|no cough/i.test(note)) return null;
  const uncertain = /疑似|待定|suspect/i.test(note);
  const result = (low, high = low) => ({ low, high, uncertain });
  // Caregiver previously clarified that this 20-second episode had about 20 coughs.
  if (id === '0d64d68e-da32-48b3-8956-1767a15a9786' && /20秒/.test(note)) return result(20);
  if (/至少二十多|至少20多/.test(note)) return result(21, null);
  const minimum = note.match(/至少\s*(\d+)\s*(?:下|声|coughs)/i);
  if (minimum) return result(+minimum[1], null);
  const range = note.match(/(\d+)\s*[-–~至到]\s*(\d+)\s*(?:下|声|次|coughs)/i);
  if (range) return result(Math.min(+range[1], +range[2]), Math.max(+range[1], +range[2]));
  const rules = [
    [/十一二下/, 11, 12], [/十几|十余|十多/, 11, 19], [/七八/, 7, 8],
    [/六七/, 6, 7], [/四五/, 4, 5], [/三四/, 3, 4], [/两三/, 2, 3],
    [/近20下/, 20, 20], [/约20下/, 20, 20], [/约30下/, 30, 30],
    [/约十下|小咳十下|咳嗽十下/, 10, 10], [/两下/, 2, 2],
    [/一小下|一下|一声/, 1, 1],
  ];
  for (const [pattern, low, high] of rules) if (pattern.test(note)) return result(low, high);
  const exact = note.match(/(\d+)\s*(?:下|声|coughs)/i);
  if (exact) return result(+exact[1]);
  return result(null, null);
}

export function frequencyLabel(frequency = '') {
  if (/隔天1次|隔日1次/.test(frequency ?? '')) return 'q48h';
  const match = String(frequency ?? '').match(/每(?:天|日)(\d+)次|每(\d+)天(\d+)次/);
  if (!match) return 'Frequency unspecified';
  const days = match[1] ? 1 : +match[2];
  const times = +(match[1] ?? match[3]);
  if (days === 1) return ({ 1: 'QD', 2: 'BID', 3: 'TID' })[times] ?? `${times}/day`;
  return times === 1 ? (days === 2 ? 'q48h' : `q${days}d`) : `${times} doses/${days} days`;
}

function medication(rows, start, end, name, unit, pattern) {
  const records = rows.filter((r) => ['inhaled', 'oral'].includes(r.type) && pattern.test(r.medicine ?? ''));
  const daily = new Map();
  let previous = null;
  const planned = new Map();
  for (const r of records) {
    const label = `${r.dose_amount ?? '?'} ${r.dose_unit ?? '?'} ${frequencyLabel(r.frequency)}`;
    if (r.day < start) previous = label;
    if (r.day >= start && r.day <= end) {
      const item = daily.get(r.day) ?? { date: r.day, total: 0, count: 0, valid: true, records: [] };
      item.count++;
      const dose = Number(r.dose_amount);
      if (r.dose_unit !== unit || !Number.isFinite(dose) || dose <= 0) item.valid = false;
      else item.total += dose;
      item.records.push(r);
      daily.set(r.day, item);
      const labels = planned.get(r.day) ?? new Set();
      labels.add(label); planned.set(r.day, labels);
    }
  }
  const stages = [];
  let active = previous;
  let from = start;
  for (const [day, labels] of planned) {
    const label = [...labels].join(' / ');
    if (label !== active) {
      if (active && day > from) stages.push({ start: from, end: day, label: active });
      active = label; from = day;
    }
  }
  if (active) stages.push({ start: from, end: dayString(dateNumber(end) + 1), label: active });
  return { name, unit, daily: [...daily.values()], stages };
}

export function buildInsights(source, start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
      !Number.isFinite(dateNumber(start)) || !Number.isFinite(dateNumber(end)) || start > end) {
    throw new Error('请选择有效的开始和结束日期，开始日期不能晚于结束日期。');
  }
  if (dayString(dateNumber(start)) !== start || dayString(dateNumber(end)) !== end) throw new Error('请选择有效的日期。');
  const rows = [...new Map(source.map((r) => [r.id, r])).values()]
    .map((r) => { const parts = chicagoParts(r.occurred_at); return parts ? { ...r, day: parts.date, hour: parts.hour, time: parts.time } : null; })
    .filter(Boolean).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || String(a.id).localeCompare(String(b.id)));
  const selected = rows.filter((r) => r.day >= start && r.day <= end);
  const coughs = selected.filter((r) => r.type === 'behavior')
    .map((r) => { const bounds = parseCough(r.note, r.id); return bounds ? { ...r, ...bounds } : null; }).filter(Boolean);
  const daily = new Map();
  for (const event of coughs) {
    const item = daily.get(event.day) ?? { date: event.day, count: 0, low: 0, high: 0, unknown: 0 };
    item.count++;
    if (event.low === null) item.unknown++;
    else { item.low += event.low; item.high = item.high === null || event.high === null ? null : item.high + event.high; }
    daily.set(event.day, item);
  }
  const antibiotic = selected.filter((r) => /amoxicillin|阿莫西林/i.test(r.medicine ?? ''));
  const courses = [];
  for (const r of antibiotic) {
    let course = courses.at(-1);
    if (!course || dateNumber(r.day) - dateNumber(course.end) > 2) {
      course = { start: r.day, end: r.day, count: 0 }; courses.push(course);
    }
    course.end = r.day; course.count++;
  }
  return { start, end, rows: selected, coughs, coughDaily: [...daily.values()],
    fluticasone: medication(rows, start, end, 'Fluticasone', 'mcg', /fluticasone|氟替卡松/i),
    prednisolone: medication(rows, start, end, 'Prednisolone', 'mg', /prednisolone|泼尼松龙/i),
    nasal: selected.filter((r) => r.type === 'behavior' && /鼻涕|nasal discharge/i.test(r.note ?? '') && !/未见|没有|没看清|no discharge/i.test(r.note)),
    antibiotic, courses, unknownCount: coughs.filter((r) => r.low === null).length };
}

// Every page is a JPEG snapshot of the very same canvas shown in the app.
// PDF offsets use byte counts so binary image streams cannot invalidate xrefs.
export function createChartPdf(pages) {
  const encoder = new TextEncoder();
  const chunks = []; const offsets = [0]; let size = 0;
  const append = (value) => { const bytes = typeof value === 'string' ? encoder.encode(value) : value; chunks.push(bytes); size += bytes.length; };
  const object = (id, body, bytes) => {
    offsets[id] = size; append(`${id} 0 obj\n${body}`);
    if (bytes) { append('\nstream\n'); append(bytes); append('\nendstream'); }
    append('\nendobj\n');
  };
  append('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const ids = pages.map((_, i) => 3 + i * 3);
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${ids.map((id) => `${id} 0 R`).join(' ')}] >>`);
  pages.forEach(({ bytes, width, height }, i) => {
    const id = ids[i];
    const pageWidth = height > width ? 612 : 792;
    const pageHeight = height > width ? 792 : 612;
    const scale = Math.min((pageWidth - 48) / width, (pageHeight - 48) / height);
    const w = width * scale; const h = height * scale;
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Chart ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
    object(id + 1, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>`, bytes);
    const content = encoder.encode(`q ${w} 0 0 ${h} ${(pageWidth - w) / 2} ${(pageHeight - h) / 2} cm /Chart Do Q`);
    object(id + 2, `<< /Length ${content.length} >>`, content);
  });
  const xref = size;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (let id = 1; id < offsets.length; id++) append(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}
