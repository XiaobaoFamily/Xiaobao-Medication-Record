import * as echarts from './vendor/echarts/echarts.esm.min.js';
import { dateNumber, dayString } from './insights-data.js';
import { regimenColor } from './regimen-colors.js';

const ink = '#24313d', muted = '#586976', episodeColor = '#3274a1', red = '#c44e52';
const observers = new WeakMap();
const font = (size, bold = false) => `${bold ? '600 ' : ''}${size}px system-ui, sans-serif`;
const text = (value, x, y, size = 20, fill = ink, bold = false) => ({
  type: 'text', silent: true, style: { text: value, x, y, fill, font: font(size, bold) },
});
function wrap(value, limit = 43) {
  const lines = [''];
  for (const word of value.split(' ')) {
    if ((lines.at(-1) + ' ' + word).trim().length > limit && lines.at(-1)) lines.push(word);
    else lines[lines.length - 1] = (lines.at(-1) + ' ' + word).trim();
  }
  return lines;
}
export function disposeChart(canvas) {
  observers.get(canvas)?.disconnect();observers.delete(canvas);
  echarts.getInstanceByDom(canvas)?.dispose();
}
export function prepareChartExport(canvas) {
  const chart = echarts.getInstanceByDom(canvas);
  if (chart) { chart.dispatchAction({ type: 'hideTip' });chart.getZr().flush(); }
}
// A CSS transform preserves canvas-local pointer coordinates for hit testing.
export function mountChart(canvas, frame) {
  frame.style.aspectRatio = `1600 / ${canvas.height}`;canvas.style.height = `${canvas.height}px`;
  const resize = () => { if (frame.clientWidth) canvas.style.transform = `scale(${frame.clientWidth / 1600})`; };
  const observer = new ResizeObserver(resize);observers.set(canvas, observer);observer.observe(frame);resize();
}
function header(title, data) {
  return [text(title, 80, 32, 32, ink, true), text(`${data.start} to ${data.end}  |  Chicago local dates`, 80, 80, 22, muted)];
}
function dateAxis(data, gridIndex = 0) {
  const start = dateNumber(data.start), end = dateNumber(data.end) + 1;
  return { type: 'value', gridIndex, min: start, max: end, minInterval: 1, splitNumber: 8,
    axisLabel: { fontSize: 19, color: muted, margin: 16, formatter: v => v >= end ? '' : dayString(v).slice(5) },
    axisLine: { lineStyle: { color: '#b8c8d1' } }, axisTick: { show: false },
    splitLine: { show: true, lineStyle: { color: '#e7edf1', type: 'dashed' } },
    name: 'Date (Chicago local time)', nameLocation: 'middle', nameGap: 53, nameTextStyle: { fontSize: 20, color: muted },
  };
}
function numberAxis(gridIndex, max, interval) {
  return { type: 'value', gridIndex, min: 0, max, interval, axisLabel: { fontSize: 20, color: ink }, splitLine: { lineStyle: { color: '#dce5eb' } } };
}
function tooltip(formatter) {
  return { trigger: 'item', renderMode: 'richText', confine: true, hideDelay: 0, textStyle: { fontSize: 19 }, formatter };
}
function init(canvas, height, option) {
  disposeChart(canvas);canvas.width = 1600;canvas.height = height;
  const chart = echarts.init(canvas, null, { renderer: 'canvas', width: 1600, height, devicePixelRatio: 1 });
  chart.setOption({ animation: false, backgroundColor: '#fff', textStyle: { fontFamily: 'system-ui, sans-serif', color: ink }, ...option });
  return chart;
}
function legend(graphics, items, y, spacing = 400) {
  items.forEach(([name, color], i) => {
    graphics.push({ type: 'circle', silent: true, shape: { cx: 100 + i * spacing, cy: y + 10, r: 6 }, style: { fill: color } }, text(name, 116 + i * spacing, y, 18));
  });
}
const episodeMax = data => Math.max(2, ...data.coughDaily.map(d => d.count)) + 2;
const countMax = data => Math.ceil(Math.max(20, ...data.coughDaily.map(d => (d.high ?? d.low) + 10)) / 20) * 20;
function coughTooltip(p, data) {
  const d = Array.isArray(p.data) && data.coughDaily[p.data[4]];
  if (!d) return p.name;
  const count = d.high === null || d.unknown ? (d.low ? `>=${d.low}` : 'Unspecified') : d.high === d.low ? `${d.low}` : `${d.low}-${d.high}`;
  return `${d.date}\n${d.count} recorded cough episodes\n${count} estimated individual coughs${d.unknown ? '\nIncludes episodes with unspecified count' : ''}`;
}
function episodeSeries(data, gridIndex) {
  return { name: 'Recorded cough episodes', type: 'custom', xAxisIndex: gridIndex, yAxisIndex: gridIndex, encode: { x: 0, y: 1 },
    data: data.coughDaily.map((d, i) => [dateNumber(d.date) + .5, d.count, 0, 0, i]),
    renderItem: (params, api) => {
      const [x, y] = api.coord([api.value(0), api.value(1)]), bottom = api.coord([api.value(0), 0])[1];
      const w = Math.min(34, api.size([1, 0])[0] * .65);
      return { type: 'rect', shape: { x: x - w / 2, y, width: w, height: bottom - y, r: [3, 3, 0, 0] }, style: { fill: episodeColor } };
    },
  };
}
function countSeries(data, gridIndex) {
  return { name: 'Estimated individual coughs', type: 'custom', xAxisIndex: gridIndex, yAxisIndex: gridIndex, encode: { x: 0, y: 1 },
    data: data.coughDaily.map((d, i) => [dateNumber(d.date) + .5, (d.high ?? d.low), d.low, d.high, i]),
    renderItem: (params, api) => {
      const d = data.coughDaily[api.value(4)], value = d.high === null ? d.low : (d.low + d.high) / 2;
      const [x, y] = api.coord([api.value(0), value]), bottom = api.coord([api.value(0), 0])[1];
      const w = Math.min(32, api.size([1, 0])[0] * .65);
      const children = [{ type: 'rect', shape: { x: x - w / 2, y, width: w, height: Math.max(0, bottom - y) }, style: { fill: red } }];
      if (d.high !== null) {
        const hi = api.coord([api.value(0), d.high])[1], lo = api.coord([api.value(0), d.low])[1];
        children.push({ type: 'line', shape: { x1: x, y1: hi, x2: x, y2: lo }, style: { stroke: ink, lineWidth: 2 } },
          { type: 'line', shape: { x1: x - 5, y1: hi, x2: x + 5, y2: hi }, style: { stroke: ink, lineWidth: 2 } });
      }
      if (d.high === null || d.unknown) children.push({ type: 'text', style: { text: d.low ? `>=${d.low}` : '?', x, y: y - 25, font: font(17), align: 'center', fill: red } });
      return { type: 'group', children };
    },
  };
}
function annotations(data, max, gridIndex) {
  return [
    { name: 'Nasal discharge', type: 'scatter', xAxisIndex: gridIndex, yAxisIndex: gridIndex, symbolSize: 11, itemStyle: { color: '#6c5ce7' },
      data: [...new Set(data.nasal.map(r => r.day))].map(day => ({ name: `${day}: nasal discharge recorded`, value: [dateNumber(day) + .5, max * .95] })) },
    { name: 'Amoxicillin/clavulanate', type: 'custom', xAxisIndex: gridIndex, yAxisIndex: gridIndex,
      data: data.courses.map(s => ({ name: `${s.start} to ${s.end}: amoxicillin/clavulanate (${s.count} records)`, value: [dateNumber(s.start), dateNumber(s.end) + 1] })),
      renderItem: (params, api) => {
        const [x1, y] = api.coord([api.value(0), max * .86]), [x2] = api.coord([api.value(1), max * .86]);
        return { type: 'line', shape: { x1, y1: y, x2, y2: y }, style: { stroke: '#238c85', lineWidth: 5 } };
      },
    },
  ];
}
// Internal interval ends are exclusive; visible dates are inclusive. The final
// segment reaches the selected view boundary, not a confirmed medication stop.
export function renderRegimenChart(canvas, data, single = null) {
  const meds = single ? [data[single]] : [data.fluticasone, data.prednisolone];
  const combined = !single, end = dateNumber(data.end) + 1;
  const schemes = meds.flatMap((med, lane) => med.stages.map((s, i) => {
    const color = regimenColor(med.name, s.label);
    return { ...s, lane, id: `${med.name === 'Fluticasone' ? 'F' : 'P'}${i + 1}`,
      color: color.fill, colorStatus: color.status, dailyAverage: color.dailyAverage, unit: color.unit, last: dateNumber(s.end) === end, endDate: dayString(dateNumber(s.end) - 1) };
  }));
  const graphics = header(combined ? 'Medication Regimens and Cough Timeline' : `${meds[0].name} Regimen Timeline`, data);
  graphics.push(text('Color: scheduled average dose per day within each medication', 100, 135, 22, muted),
    text('Darker = higher daily average; mixed regimens: simple mean; unfilled = missing data.', 100, 164, 18, muted));
  meds.forEach((med, i) => graphics.push(text(med.name, 100, 192 + i * 120, 24, ink, true)));
  const tableTop = combined ? 1060 : 460;
  graphics.push(text('Regimen dates and doses', 80, tableTop, 26, ink, true));
  let tableBottom = tableTop + 90;
  meds.forEach((med, lane) => {
    const x = lane === 0 ? 80 : 840, width = combined ? 680 : 1440;
    graphics.push(text(med.name, x, tableTop + 50, 24, ink, true));
    let y = tableTop + 90;
    if (!med.stages.length) graphics.push(text('No regimen recorded.', x, y + 10, 20, muted));
    for (const s of schemes.filter(s => s.lane === lane)) {
      const average = s.dailyAverage === null ? 'daily average unavailable' : `~${Number(s.dailyAverage.toPrecision(4))} ${s.unit}/day${s.colorStatus === 'mixed' ? ' (simple mean)' : ''}`;
      const lines = wrap(`${s.label}  |  ${average}`, combined ? 43 : 95), height = lines.length * 26 + 44 + (s.last ? 25 : 0);
      graphics.push({ type: 'rect', silent: true, shape: { x, y, width, height: height - 8, r: 8 }, style: { fill: '#f5f8fa' } },
        { type: 'rect', silent: true, shape: { x: x + 12, y: y + 12, width: 49, height: 30, r: 5 }, style: { fill: s.color, stroke: s.colorStatus === 'unknown' ? '#8a99a5' : undefined, lineWidth: 1, lineDash: s.colorStatus === 'unknown' ? [4, 3] : undefined } }, text(s.id, x + 19, y + 17, 18, ink, true));
      lines.forEach((line, i) => graphics.push(text(line, x + 78, y + 11 + i * 26, 21, ink, true)));
      graphics.push(text(`${s.start}  to  ${s.endDate}`, x + 78, y + 15 + lines.length * 26, 20, muted));
      if (s.last) graphics.push(text('Through selected range end; stop date not established', x + 78, y + 41 + lines.length * 26, 18, muted));
      y += height;
    }
    tableBottom = Math.max(tableBottom, y);
  });
  const height = Math.max(combined ? 1500 : 900, tableBottom + 140);
  graphics.push(text('Regimen intervals follow recorded changes; gaps between dose logs do not establish a stop date.', 80, height - 105, 20, muted),
    text('A regimen at the range start may continue from an earlier record. Table date ranges are inclusive.', 80, height - 73, 20, muted),
    text(combined ? 'Colors show schedule averages, not confirmed doses. No cough log does not confirm no symptoms.' : 'Daily averages are calculated from recorded dose and frequency; they are not confirmed doses actually given.', 80, height - 41, 20, muted));
  const series = [{ name: 'Medication regimen', type: 'custom', xAxisIndex: 0, yAxisIndex: 0, encode: { x: [0, 1], y: 2 },
    data: schemes.map((s, i) => [dateNumber(s.start), dateNumber(s.end), s.lane, i]),
    renderItem: (params, api) => {
      const s = schemes[api.value(3)], a = api.coord([api.value(0), api.value(2)]), b = api.coord([api.value(1), api.value(2)]), width = b[0] - a[0];
      const children = [{ type: 'rect', shape: { x: a[0] + 1, y: a[1] - 37, width: Math.max(1, width - 2), height: 74, r: Math.min(8, width / 4) }, style: { fill: s.color, stroke: s.colorStatus === 'unknown' ? '#8a99a5' : '#ffffff', lineWidth: 2, lineDash: s.colorStatus === 'unknown' ? [5, 4] : undefined } }];
      const dates = width > 360 ? `${s.start} to ${s.endDate}` : `${s.start.slice(5)} to ${s.endDate.slice(5)}`;
      if (width > 28) children.push({ type: 'text', style: { text: width > 250 ? `${s.id} · ${s.label}\n${dates}` : width > 175 ? `${s.id} · ${s.label}` : s.id,
        x: a[0] + width / 2, y: a[1], align: 'center', verticalAlign: 'middle', font: font(width > 175 ? 19 : 18, true), lineHeight: 26, fill: ink, width: Math.max(1, width - 16), overflow: 'truncate' } });
      return { type: 'group', children };
    },
  }];
  const grid = [{ left: 100, right: 220, top: 200, height: meds.length * 120 }];
  const xAxis = [dateAxis(data)], yAxis = [{ type: 'category', gridIndex: 0, data: meds.map(m => m.name), inverse: true, show: false }];
  if (combined) {
    graphics.push(text('Recorded cough episodes/day', 100, 540, 24, ink, true));
    legend(graphics, [['Recorded episodes', episodeColor], ['Nasal discharge', '#6c5ce7'], ['Amoxicillin/clavulanate', '#238c85']], 990);
    grid.push({ left: 100, right: 220, top: 590, height: 300 });xAxis.push(dateAxis(data, 1));yAxis.push(numberAxis(1, episodeMax(data), 1));
    series.push(episodeSeries(data, 1), ...annotations(data, episodeMax(data), 1));
  }
  return init(canvas, height, { graphic: graphics, grid, xAxis, yAxis, series, tooltip: tooltip(p => {
    if (p.seriesIndex !== 0) return coughTooltip(p, data);
    const s = schemes[p.data[3]];
    const average = s.dailyAverage === null ? 'Daily average unavailable (missing dose or frequency)' : `Schedule average: ~${Number(s.dailyAverage.toPrecision(4))} ${s.unit}/day${s.colorStatus === 'mixed' ? '\nSimple mean of recorded regimens' : ''}`;
    return `${s.id} · ${meds[s.lane].name}\n${s.label}\n${average}\n${s.start} to ${s.endDate}${s.last ? '\nSelected range boundary; stop date not established' : ''}`;
  }) });
}
export function renderCoughChart(canvas, data) {
  const graphics = header('Recorded Cough Episodes and Estimated Counts', data);
  graphics.push(text('Recorded episodes/day', 100, 145, 25, ink, true), text('One behavior record = one recorded episode, including episodes with unspecified cough counts.', 100, 180, 20, muted),
    text('Estimated individual coughs/day', 100, 655, 25, ink, true), text('Counts from notes; whiskers show ranges. >= means lower bound; ? means count unspecified.', 100, 690, 20, muted));
  legend(graphics, [['Recorded episodes', episodeColor], ['Nasal discharge', '#6c5ce7'], ['Amoxicillin/clavulanate', '#238c85']], 570);
  legend(graphics, [['Estimated coughs / range', red]], 1090);
  graphics.push(text('A day without a cough log is not confirmation of a symptom-free day.', 80, 1180, 20, muted),
    text(`${data.coughs.length} recorded episodes; ${data.unknownCount} have unspecified individual cough counts.`, 80, 1215, 20, muted));
  return init(canvas, 1290, { graphic: graphics,
    grid: [{ left: 100, right: 220, top: 220, height: 250 }, { left: 100, right: 220, top: 730, height: 260 }],
    xAxis: [dateAxis(data), dateAxis(data, 1)], yAxis: [numberAxis(0, episodeMax(data), 1), numberAxis(1, countMax(data), 20)],
    series: [episodeSeries(data, 0), countSeries(data, 1), ...annotations(data, episodeMax(data), 0)], tooltip: tooltip(p => coughTooltip(p, data)),
  });
}
export function renderTimeChart(canvas, data) {
  const graphics = header('Cough Episodes by Time of Day', data);
  graphics.push(text('Chicago local time', 100, 135, 21, muted), text('X: suspected cough', 1260, 440, 19), text('Ring: breathing concern', 1260, 480, 19),
    text(`${data.coughs.length} timed records in selected range. Same-day nearby records are separated horizontally within that day.`, 80, 850, 20, muted),
    text('Drag the date slider to inspect a shorter period. Hover a point for the exact recorded time.', 80, 890, 20, muted));
  const groups = new Map();
  for (const e of data.coughs) { const key = `${e.day}:${Math.round(e.hour)}`;const group = groups.get(key) ?? [];group.push(e);groups.set(key, group); }
  const jitter = new Map();
  for (const group of groups.values()) group.forEach((e, i) => jitter.set(e.id, group.length === 1 ? 0 : (i / (group.length - 1) - .5) * .6));
  const names = ['1 cough', '2-9 coughs', '10+ coughs', 'Count unspecified'];
  const categories = e => e.low === null ? 3 : e.low === 1 && e.high === 1 ? 0 : (e.high ?? e.low) < 10 ? 1 : 2;
  const series = names.map((name, i) => ({ name, type: 'scatter', itemStyle: { color: ['#3274a1', '#e1812c', red, '#83919a'][i] }, symbolSize: [9, 13, 17, 12][i],
    data: data.coughs.filter(e => categories(e) === i).map(e => ({ value: [dateNumber(e.day) + .5 + jitter.get(e.id), e.hour], event: e,
      itemStyle: { color: ['#3274a1', '#e1812c', red, '#83919a'][i], borderColor: /难呼吸|抽喘|breathing difficulty/i.test(e.note) ? '#7a0019' : '#fff', borderWidth: /难呼吸|抽喘|breathing difficulty/i.test(e.note) ? 3 : 1 },
      label: { show: e.uncertain, formatter: '×', fontSize: 20, color: ink } })),
  }));
  series[0].markArea = { silent: true, data: ['#f0eef7', '#fff5d9', '#e8f3f8', '#f5ece8'].map((color, i) => [{ yAxis: i * 6, itemStyle: { color } }, { yAxis: (i + 1) * 6 }]) };
  return init(canvas, 950, { graphic: graphics, grid: { left: 100, right: 380, top: 180, height: 430 },
    xAxis: dateAxis(data), yAxis: { ...numberAxis(0, 24, 3), axisLabel: { fontSize: 20, formatter: v => `${String(v).padStart(2, '0')}:00` } },
    legend: { orient: 'vertical', right: 36, top: 190, itemGap: 26, textStyle: { fontSize: 20 }, data: names },
    dataZoom: [{ type: 'slider', xAxisIndex: 0, bottom: 175, height: 32, filterMode: 'none', labelFormatter: v => dayString(Math.floor(v)) }, { type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false }],
    series, tooltip: tooltip(p => {
      const e = p.data.event, count = e.low === null ? 'Count unspecified' : e.high === null ? `>=${e.low} coughs` : e.low === e.high ? `${e.low} coughs` : `${e.low}-${e.high} coughs`;
      return `${e.day} ${e.time}\n${count}${e.uncertain ? '\nSuspected cough' : ''}${/难呼吸|抽喘|breathing difficulty/i.test(e.note) ? '\nBreathing concern recorded' : ''}`;
    }),
  });
}
