import { buildInsights, chicagoParts, createChartPdf, dateNumber, dayString } from './insights-data.js';

const ink = '#24313d'; const blue = '#3274a1'; const orange = '#e1812c'; const red = '#c44e52';
const palette = ['#dceaf7', '#e4f2e3', '#f3eaf8', '#fff0c2', '#d9f0ee', '#f6ddde', '#e8e7cf', '#eddcc7', '#dcdff3', '#f6e3ef', '#d8ede2', '#e6edf0'];
const titles = ['Fluticasone Daily Dose and Frequency', 'Prednisolone Daily Dose and Frequency',
  'Cough Burden and Upper-Airway Records', 'Combined Medication and Cough Timeline', 'Cough Episodes by Time of Day'];

function text(ctx, value, x, y, size = 22, color = ink, align = 'left') {
  ctx.font = `${size}px system-ui, sans-serif`; ctx.fillStyle = color; ctx.textAlign = align;
  ctx.fillText(value, x, y); ctx.textAlign = 'left';
}
function line(ctx, x1, y1, x2, y2, color = '#d9e0e6', width = 1) {
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function dot(ctx, x, y, radius, color) {
  ctx.beginPath(); ctx.fillStyle = color; ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
}
function axis(ctx, data, top, height, max, { time = false, right = 220, tickStep = max / 4 } = {}) {
  const left = 100; const bottom = top + height; const width = 1600 - left - right;
  const start = dateNumber(data.start); const days = dateNumber(data.end) - start + 1;
  const x = (day) => left + ((dateNumber(day) - start + .5) / days) * width;
  const edge = (day) => left + ((dateNumber(day) - start) / days) * width;
  const y = (value) => bottom - value / max * height;
  const spacing = time ? 3 : tickStep;
  const ticks = Array.from({ length: Math.round(max / spacing) + 1 }, (_, i) => i * spacing);
  for (const value of ticks) {
    line(ctx, left, y(value), left + width, y(value));
    text(ctx, time ? `${String(value).padStart(2, '0')}:00` : String(Math.round(value * 10) / 10), left - 15, y(value) + 7, 21, ink, 'right');
  }
  line(ctx, left, top, left, bottom, ink); line(ctx, left, bottom, left + width, bottom, ink);
  const step = Math.max(1, Math.ceil(days / 9));
  const positions = [];
  for (let i = 0; i < days; i += step) positions.push(i);
  if (days > 1 && days - 1 - positions.at(-1) >= step * .65) positions.push(days - 1);
  for (const i of positions) {
    const day = dayString(start + i);
    text(ctx, day.slice(5), x(day), bottom + 35, 20, ink, 'center');
  }
  text(ctx, 'Date (Chicago local time)', left + width / 2, bottom + 74, 22, ink, 'center');
  return { x, y, edge, left, rightX: left + width, top, bottom, width, days, ticks };
}

function medication(ctx, data, med, top, compact = false) {
  const height = compact ? 270 : 430;
  const tickStep = med.name === 'Fluticasone' ? 110 : 2.5;
  const peak = Math.max(med.name === 'Fluticasone' ? 440 : 5, ...med.daily.filter((d) => d.valid).map((d) => d.total));
  const max = Math.ceil(peak / tickStep) * tickStep;
  const a = axis(ctx, data, top, height, max, { tickStep });
  const keys = [...new Set(med.stages.map((s) => s.label))];
  // Draw the bands behind the dose marks, then redraw the grid.
  for (const s of med.stages) {
    ctx.fillStyle = palette[keys.indexOf(s.label) % palette.length];
    ctx.fillRect(a.edge(s.start), top, a.edge(s.end) - a.edge(s.start), height);
    if (a.edge(s.end) - a.edge(s.start) > 195) text(ctx, s.label, (a.edge(s.start) + a.edge(s.end)) / 2, top + 32, 19, ink, 'center');
  }
  for (const value of a.ticks) line(ctx, a.left, a.y(value), a.rightX, a.y(value));
  text(ctx, `Daily total (${med.unit})`, a.left, top - 18, 20);
  text(ctx, 'Recorded doses/day', a.rightX + 15, top - 18, 18, '#7a5195');
  const maxFreq = Math.max(2, ...med.daily.map((d) => d.count));
  const frequencyY = (count) => a.bottom - count / (maxFreq + 1) * height;
  for (let i = 0; i <= maxFreq; i++) text(ctx, String(i), a.rightX + 16, a.bottom - i / (maxFreq + 1) * height + 6, 20, '#7a5195');
  const doseColor = med.name === 'Fluticasone' ? blue : orange;
  for (const day of med.daily) {
    if (day.valid) {
      const xx = a.x(day.date); const yy = a.y(day.total);
      ctx.fillStyle = `${doseColor}bb`;
      const w = Math.min(32, a.width / a.days * .65);
      ctx.fillRect(xx - w / 2, yy, w, a.bottom - yy);
    }
  }
  // Each horizontal segment covers only a day with recorded administrations.
  // Consecutive days meet at their shared boundary; gaps remain disconnected.
  let previous;
  for (const day of med.daily) {
    const from = a.edge(day.date); const to = a.edge(dayString(dateNumber(day.date) + 1));
    const yy = frequencyY(day.count);
    if (previous && dateNumber(day.date) - dateNumber(previous.date) === 1) {
      line(ctx, from, frequencyY(previous.count), from, yy, '#ffffff', 6);
      line(ctx, from, frequencyY(previous.count), from, yy, '#7a5195', 3);
    }
    line(ctx, from, yy, to, yy, '#ffffff', 6);
    line(ctx, from, yy, to, yy, '#7a5195', 3);
    previous = day;
  }
  const seriesY = a.bottom + 114;
  ctx.fillStyle = `${doseColor}bb`;ctx.fillRect(100, seriesY - 17, 22, 20);
  text(ctx, 'Daily dose: bars (left axis)', 135, seriesY, 18);
  line(ctx, 600, seriesY - 5, 618, seriesY - 5, '#7a5195', 3);
  line(ctx, 618, seriesY - 5, 618, seriesY - 16, '#7a5195', 3);
  line(ctx, 618, seriesY - 16, 636, seriesY - 16, '#7a5195', 3);
  text(ctx, 'Recorded doses/day: steps (right axis)', 650, seriesY, 18);
  const base = seriesY + 38;
  keys.forEach((label, i) => {
    const xx = 100 + i % 3 * 465; const yy = base + Math.floor(i / 3) * 34;
    ctx.fillStyle = palette[i % palette.length]; ctx.fillRect(xx, yy - 16, 24, 20);
    text(ctx, label, xx + 35, yy, 18);
  });
  if (!med.daily.length) text(ctx, 'No medication administrations recorded in this range.', 150, top + height / 2, 24);
}

function cough(ctx, data, top, compact = false) {
  const height = compact ? 320 : 430;
  const max = Math.ceil(Math.max(20, ...data.coughDaily.map((d) => (d.high ?? d.low) + 10)) / 20) * 20;
  const a = axis(ctx, data, top, height, max, { tickStep: 20 });
  text(ctx, 'Estimated coughs/day', a.left, top - 18, 20);
  text(ctx, 'Episodes/day', a.rightX + 15, top - 18, 19);
  const maxFreq = Math.max(2, ...data.coughDaily.map((d) => d.count));
  for (let i = 0; i <= maxFreq; i++) text(ctx, String(i), a.rightX + 16, a.bottom - i / (maxFreq + 1) * height + 6, 20);
  for (const day of data.coughDaily) {
    const value = day.high === null ? day.low : (day.low + day.high) / 2;
    const w = Math.min(32, a.width / a.days * .65); const xx = a.x(day.date);
    ctx.fillStyle = red; ctx.fillRect(xx - w / 2, a.y(value), w, a.bottom - a.y(value));
    if (day.high !== null) {
      line(ctx, xx, a.y(day.low), xx, a.y(day.high), ink, 2);
      line(ctx, xx - 5, a.y(day.high), xx + 5, a.y(day.high), ink, 2);
    }
    if (day.high === null || day.unknown) text(ctx, day.low ? `>=${day.low}` : '?', xx, a.y(value) - 14, 17, red, 'center');
    dot(ctx, xx, a.bottom - day.count / (maxFreq + 1) * height, 5, ink);
  }
  for (const day of new Set(data.nasal.map((r) => r.day))) dot(ctx, a.x(day), top + 20, 6, '#6c5ce7');
  data.courses.forEach((s, i) => line(ctx, a.x(s.start), top + 52 + i % 2 * 12, a.x(s.end) + 3, top + 52 + i % 2 * 12, '#238c85', 5));
  const legends = [['Count / range', red], ['Episodes', ink], ['Nasal discharge', '#6c5ce7'], ['Amoxicillin/clavulanate', '#238c85']];
  legends.forEach(([label, color], i) => { dot(ctx, 100 + i * 350, a.bottom + 115, 6, color); text(ctx, label, 115 + i * 350, a.bottom + 122, 18); });
  if (!data.coughs.length) text(ctx, 'No cough episodes recorded in this range.', 150, top + height / 2, 24);
}

function timeOfDay(ctx, data) {
  // The legend has its own column. It never occupies the time axis or data area.
  const top = 150; const height = 440;
  const left = 100; const width = 1120;
  ['#f0eef7', '#fff5d9', '#e8f3f8', '#f5ece8'].forEach((color, i) => {
    ctx.fillStyle = color; ctx.fillRect(left, top + height - (i + 1) * height / 4, width, height / 4);
  });
  const a = axis(ctx, data, top, height, 24, { time: true, right: 380 });
  text(ctx, 'Chicago time', 100, 125, 20);
  const groups = new Map();
  for (const e of data.coughs) { const key = `${e.day}:${Math.round(e.hour * 4)}`; const group = groups.get(key) ?? []; group.push(e); groups.set(key, group); }
  for (const group of groups.values()) group.forEach((e, i) => {
    const xx = a.x(e.day) + (i - (group.length - 1) / 2) * 19;
    const index = e.low === null ? 3 : e.low === 1 && e.high === 1 ? 0 : (e.high ?? e.low) < 10 ? 1 : 2;
    const radius = [6, 9, 12, 8][index];
    dot(ctx, xx, a.y(e.hour), radius, [blue, orange, red, '#83919a'][index]);
    if (e.uncertain) { line(ctx, xx - 7, a.y(e.hour) - 7, xx + 7, a.y(e.hour) + 7, ink, 2); line(ctx, xx - 7, a.y(e.hour) + 7, xx + 7, a.y(e.hour) - 7, ink, 2); }
    if (/难呼吸|抽喘|breathing difficulty/i.test(e.note)) {
      ctx.beginPath();ctx.strokeStyle = '#7a0019';ctx.lineWidth = 2;ctx.arc(xx, a.y(e.hour), radius + 4, 0, Math.PI * 2);ctx.stroke();
    }
  });
  text(ctx, 'Coughs per record', 1260, 165, 21);
  ['1 cough', '2-9 coughs', '10+ coughs', 'Count unspecified'].forEach((label, i) => {
    dot(ctx, 1270, 210 + i * 48, [6, 9, 12, 8][i], [blue, orange, red, '#83919a'][i]);text(ctx, label, 1294, 218 + i * 48, 20);
  });
  text(ctx, 'Cross: suspected cough', 1260, 432, 18);
  text(ctx, 'Ring: breathing concern', 1260, 472, 18);
  text(ctx, `${data.coughs.length} timed cough records. Nearby points on the same day are separated horizontally.`, 100, 740, 21);
}

export function renderChart(canvas, kind, data) {
  const legendRows = (med) => Math.max(1, Math.ceil(new Set(med.stages.map((s) => s.label)).size / 3));
  const afterMedication = (top, med) => top + 270 + 152 + (legendRows(med) - 1) * 34 + 105;
  const predTop = afterMedication(170, data.fluticasone);
  const coughTop = afterMedication(predTop, data.prednisolone);
  canvas.width = 1600;
  canvas.height = kind === 3 ? Math.max(1800, coughTop + 540) : kind < 2 ? Math.max(900, 888 + (legendRows(kind === 0 ? data.fluticasone : data.prednisolone) - 1) * 34) : 900;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  text(ctx, titles[kind], 80, 50, 30);
  text(ctx, `${data.start} to ${data.end} (Chicago local time)`, 80, 87, 21, '#586976');
  if (kind === 0) medication(ctx, data, data.fluticasone, 150);
  if (kind === 1) medication(ctx, data, data.prednisolone, 150);
  if (kind === 2) cough(ctx, data, 150);
  if (kind === 3) {
    text(ctx, 'Fluticasone', 100, 130, 25);medication(ctx, data, data.fluticasone, 170, true);
    text(ctx, 'Prednisolone', 100, predTop - 40, 25);medication(ctx, data, data.prednisolone, predTop, true);
    text(ctx, 'Cough records', 100, coughTop - 40, 25);cough(ctx, data, coughTop, true);
  }
  if (kind === 4) timeOfDay(ctx, data);
  text(ctx, 'Daily doses are recorded totals. Cough counts are estimates from notes; >= indicates a lower bound.', 80, canvas.height - 54, 20, '#586976');
  text(ctx, 'A day without a log is not confirmation of no symptoms or no administration.', 80, canvas.height - 24, 20, '#586976');
}

export function createInsightsUI(root = document) {
  const get = (id) => root.getElementById(id);
  const form = get('insights-range'); const start = get('insights-start'); const end = get('insights-end');
  const status = get('insights-status'); const exportButton = get('insights-export'); const charts = get('insights-charts');
  let rows = []; let current = null; let canvases = []; let initialized = false;
  const setStatus = (message, error = false) => { status.textContent = message; status.classList.toggle('error', error); };
  function generate() {
    try {
      const data = buildInsights(rows, start.value, end.value);
      current = data;charts.replaceChildren();canvases = [];
      get('insights-events').replaceChildren();
      get('insights-empty').classList.toggle('hidden', data.rows.length > 0);
      get('insights-counts').textContent = `${data.rows.length} 条记录 · ${data.coughs.length} 条咳嗽记录 · ${data.unknownCount} 条未注明咳嗽次数`;
      exportButton.disabled = !data.rows.length;
      if (!data.rows.length) return setStatus('所选时间范围暂无记录。');
      for (const kind of [3, 0, 1, 2, 4]) {
        const card = root.createElement('article');card.className = 'card insight-chart';
        const h = root.createElement('h3');h.textContent = titles[kind];
        const scroller = root.createElement('div');scroller.className = 'insight-chart-scroll';scroller.tabIndex = 0;scroller.setAttribute('aria-label', titles[kind]);
        const canvas = root.createElement('canvas');canvas.setAttribute('role', 'img');canvas.setAttribute('aria-label', `${titles[kind]}, ${data.start} to ${data.end}`);
        renderChart(canvas, kind, data);scroller.append(canvas);card.append(h, scroller);charts.append(card);canvases.push(canvas);
      }
      const list = get('insights-events');list.replaceChildren();
      data.coughs.slice().reverse().forEach((e) => {
        const row = root.createElement('tr');
        const count = e.low === null ? '未注明' : e.high === null ? `至少 ${e.low}` : e.high === e.low ? `${e.low}` : `${e.low}–${e.high}`;
        for (const value of [`${e.day} ${e.time}`, count, e.note]) { const cell = root.createElement('td');cell.textContent = value;row.append(cell); }
        list.append(row);
      });
      setStatus('图表已更新，时间均按芝加哥时区。PDF 仅包含英文图表与事实说明。');
    } catch (error) { current = null;exportButton.disabled = true;charts.replaceChildren();get('insights-events').replaceChildren();get('insights-counts').textContent = '';setStatus(error.message, true); }
  }
  form.addEventListener('submit', (e) => { e.preventDefault();generate(); });
  for (const id of ['insights-all', 'insights-30']) get(id).addEventListener('click', () => {
    if (!rows.length) return;
    const dates = rows.map((r) => chicagoParts(r.occurred_at)?.date).filter(Boolean).sort();
    end.value = dates.at(-1);
    start.value = id === 'insights-all' ? dates[0] : dayString(dateNumber(end.value) - 29);
    generate();
  });
  for (const field of [start, end]) field.addEventListener('change', () => { current = null;exportButton.disabled = true;setStatus('日期已更改，点击“生成图表”应用新的时间范围。'); });
  exportButton.addEventListener('click', async () => {
    if (!current || !canvases.length) return;
    exportButton.disabled = true;setStatus('正在生成 PDF…');
    try {
      const snapshot = current;
      const pages = await Promise.all(canvases.map(async (canvas) => {
        const blob = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图表导出失败。')), 'image/jpeg', .96));
        return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
      }));
      const url = URL.createObjectURL(createChartPdf(pages));const a = root.createElement('a');a.href = url;
      a.download = `xiaobao-report-${snapshot.start}-to-${snapshot.end}.pdf`;root.body.append(a);a.click();a.remove();setTimeout(() => URL.revokeObjectURL(url), 60000);
      setStatus('PDF 已生成。');
    } catch (error) { setStatus(`PDF 导出失败：${error.message}`, true); }
    finally { exportButton.disabled = !current?.rows.length; }
  });
  return {
    setRows(next) {
      rows = next;
      if (!rows.length) { initialized = false;current = null;canvases = [];charts.replaceChildren();get('insights-events').replaceChildren();get('insights-counts').textContent = '';exportButton.disabled = true;setStatus('暂无记录。');return; }
      if (!initialized) { const dates = rows.map((r) => chicagoParts(r.occurred_at)?.date).filter(Boolean).sort();start.value = dates[0];end.value = dates.at(-1);initialized = true; }
      generate();
    },
    loading() { current = null;exportButton.disabled = true;setStatus('正在读取完整历史记录…'); },
    error(message) { current = null;exportButton.disabled = true;charts.replaceChildren();get('insights-events').replaceChildren();setStatus(`读取失败：${message}`, true); },
  };
}
