import { buildInsights, chicagoParts, createChartPdf, dateNumber, dayString } from './insights-data.js';
import { renderRegimenChart, renderCoughChart, renderTimeChart, disposeChart, mountChart, prepareChartExport } from './charts.js';

const titles = ['Fluticasone Regimen Timeline', 'Prednisolone Regimen Timeline',
  'Recorded Cough Episodes and Estimated Counts', 'Medication Regimens and Cough Timeline', 'Cough Episodes by Time of Day'];

export function renderChart(canvas, kind, data) {
  if (kind === 0) return renderRegimenChart(canvas, data, 'fluticasone');
  if (kind === 1) return renderRegimenChart(canvas, data, 'prednisolone');
  if (kind === 2) return renderCoughChart(canvas, data);
  if (kind === 3) return renderRegimenChart(canvas, data);
  if (kind === 4) return renderTimeChart(canvas, data);
}

export function createInsightsUI(root = document) {
  const get = (id) => root.getElementById(id);
  const form = get('insights-range'); const start = get('insights-start'); const end = get('insights-end');
  const status = get('insights-status'); const exportButton = get('insights-export'); const charts = get('insights-charts');
  let rows = []; let current = null; let canvases = []; let initialized = false;
  const clearCharts = () => { canvases.forEach(disposeChart);charts.replaceChildren();canvases = []; };
  const setStatus = (message, error = false) => { status.textContent = message; status.classList.toggle('error', error); };
  function generate() {
    try {
      const data = buildInsights(rows, start.value, end.value);
      current = data;clearCharts();
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
        renderChart(canvas, kind, data);
        const frame = root.createElement('div');
        frame.className = 'insight-chart-frame';frame.append(canvas);scroller.append(frame);
        card.append(h, scroller);charts.append(card);canvases.push(canvas);
        mountChart(canvas, frame);
      }
      const list = get('insights-events');list.replaceChildren();
      data.coughs.slice().reverse().forEach((e) => {
        const row = root.createElement('tr');
        const count = e.low === null ? '未注明' : e.high === null ? `至少 ${e.low}` : e.high === e.low ? `${e.low}` : `${e.low}–${e.high}`;
        for (const value of [`${e.day} ${e.time}`, count, e.note]) { const cell = root.createElement('td');cell.textContent = value;row.append(cell); }
        list.append(row);
      });
      setStatus('图表已更新，时间均按芝加哥时区。PDF 仅包含英文图表与事实说明。');
    } catch (error) { current = null;exportButton.disabled = true;clearCharts();get('insights-events').replaceChildren();get('insights-counts').textContent = '';setStatus(error.message, true); }
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
      canvases.forEach(prepareChartExport);
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
      if (!rows.length) { initialized = false;current = null;clearCharts();get('insights-events').replaceChildren();get('insights-counts').textContent = '';exportButton.disabled = true;setStatus('暂无记录。');return; }
      if (!initialized) { const dates = rows.map((r) => chicagoParts(r.occurred_at)?.date).filter(Boolean).sort();start.value = dates[0];end.value = dates.at(-1);initialized = true; }
      generate();
    },
    loading() { current = null;exportButton.disabled = true;setStatus('正在读取完整历史记录…'); },
    error(message) { current = null;exportButton.disabled = true;clearCharts();get('insights-events').replaceChildren();setStatus(`读取失败：${message}`, true); },
  };
}
