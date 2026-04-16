/**
 * dashboard.js — App logic: file handling, parsing, rendering
 */

// ── State ──
const State = {
  files: { zerodha: null, icici: null, vested: null },
  data:  { zerodha: null, icici: null, vested: null },
  usdInr: 84,
  charts: {}
};

// ── File handling ──
function handleFile(broker, input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  const statusEl = document.getElementById('status-' + broker);
  const cardEl   = document.getElementById('card-' + broker);

  statusEl.className = 'file-status';
  statusEl.textContent = '⏳ Reading…';

  reader.onload = (e) => {
    try {
      let result;
      if (broker === 'icici') {
        result = Parsers.icici(e.target.result);
      } else {
        result = Parsers[broker](e.target.result);
      }
      State.data[broker] = result;
      State.files[broker] = file.name;
      statusEl.textContent = '✓ ' + file.name;
      cardEl.classList.add('loaded');
      checkReadyState();
    } catch(err) {
      statusEl.className = 'file-status error';
      statusEl.textContent = '✗ ' + err.message;
      console.error(broker, err);
    }
  };

  if (broker === 'icici') reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
}

function checkReadyState() {
  const ready = State.data.zerodha && State.data.icici && State.data.vested;
  document.getElementById('btnAnalyze').disabled = !ready;
}

// ── Drag & drop ──
['zerodha','icici','vested'].forEach(broker => {
  const zone = document.getElementById('drop-' + broker);
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const input = document.getElementById('file-' + broker);
    const dt = new DataTransfer(); dt.items.add(file);
    input.files = dt.files;
    handleFile(broker, input);
  });
});

// ── Reset ──
function resetApp() {
  ['zerodha','icici','vested'].forEach(b => {
    State.data[b] = null; State.files[b] = null;
    document.getElementById('status-' + b).textContent = '';
    document.getElementById('card-' + b).classList.remove('loaded');
    document.getElementById('file-' + b).value = '';
  });
  Object.values(State.charts).forEach(c => { try { c.destroy(); } catch(e){} });
  State.charts = {};
  document.getElementById('btnAnalyze').disabled = true;
  document.getElementById('uploadScreen').classList.add('active');
  document.getElementById('dashScreen').classList.remove('active');
}

// ── Number formatting ──
const fmtINR = (v) => {
  const abs = Math.abs(v);
  let s;
  if (abs >= 1e7)      s = '₹' + (v/1e7).toFixed(2) + 'Cr';
  else if (abs >= 1e5) s = '₹' + (v/1e5).toFixed(2) + 'L';
  else                 s = '₹' + Math.round(v).toLocaleString('en-IN');
  return s;
};
const fmtUSD = (v) => '$' + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const fmtPct = (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
const plClass = (v) => v >= 0 ? 'pos' : 'neg';

// ── Build dashboard ──
function buildDashboard() {
  State.usdInr = parseFloat(document.getElementById('usdInr').value) || 84;

  const z = State.data.zerodha;
  const ic = State.data.icici;
  const vs = State.data.vested;

  // Segment totals — use Zerodha statement summaries directly
  const mfInvested = z.summaryMF.invested || 0;
  const mfCurrent  = z.summaryMF.current  || 0;
  const mfPL       = z.summaryMF.pl       || 0;
  const mfPlPct    = z.summaryMF.plPct    || (mfInvested > 0 ? mfPL/mfInvested*100 : 0);

  // Zerodha equity summary - subtract DEBT to get ETFs only
  const debtInvested = z.debtRows.reduce((s,r) => s + r.invested, 0);
  const debtCurrent  = z.debtRows.reduce((s,r) => s + r.currentValue, 0);
  const debtPL       = z.debtRows.reduce((s,r) => s + r.pl, 0);
  const etfInvested  = (z.summaryEq.invested || 0) - debtInvested;
  const etfCurrent   = (z.summaryEq.current  || 0) - debtCurrent;
  const etfPL        = (z.summaryEq.pl       || 0) - debtPL;

  // Indian stocks = ICICI + Zerodha ETFs
  const indStInvested = ic.summary.invested + etfInvested;
  const indStCurrent  = ic.summary.current  + etfCurrent;
  const indStPL       = ic.summary.pl       + etfPL;
  const indStPlPct    = indStInvested > 0 ? indStPL/indStInvested*100 : 0;

  // US in INR
  const usInvINR  = vs.summary.invested   * State.usdInr;
  const usCurINR  = vs.summary.current    * State.usdInr;
  const usPLINR   = vs.summary.pl         * State.usdInr;
  const usPlPct   = vs.summary.plPct;

  // Grand totals
  const totInvested = indStInvested + mfInvested + usInvINR;
  const totCurrent  = indStCurrent  + mfCurrent  + usCurINR;
  const totPL       = indStPL       + mfPL       + usPLINR;
  const totPlPct    = totInvested > 0 ? totPL/totInvested*100 : 0;

  // Store for tabs
  State.computed = { indStInvested, indStCurrent, indStPL, indStPlPct,
                     mfInvested, mfCurrent, mfPL, mfPlPct,
                     usInvINR, usCurINR, usPLINR, usPlPct,
                     totInvested, totCurrent, totPL, totPlPct };

  // Switch screens
  document.getElementById('uploadScreen').classList.remove('active');
  document.getElementById('dashScreen').classList.add('active');

  // Date
  document.getElementById('headerDate').textContent = 'As of ' + new Date().toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'});

  renderSummaryStrip(totInvested, totCurrent, totPL, totPlPct);
  renderOverview();
  renderIndianStocks(ic.stocks, z.equityEtfs);
  renderIndianMFs(z.mutualFunds);
  renderUS(vs.holdings);
  renderMovers(ic.stocks, z.equityEtfs, vs.holdings, z.mutualFunds);
}

// ── Summary Strip ──
function renderSummaryStrip(inv, cur, pl, plPct) {
  document.getElementById('sumInvested').textContent = fmtINR(inv);
  document.getElementById('sumCurrent').textContent  = fmtINR(cur);
  const plEl = document.getElementById('sumPL');
  plEl.textContent = (pl >= 0 ? '+' : '') + fmtINR(pl);
  plEl.style.color = pl >= 0 ? 'var(--gain)' : 'var(--loss)';
  const retEl = document.getElementById('sumReturn');
  retEl.textContent = fmtPct(plPct);
  retEl.style.color = plPct >= 0 ? 'var(--gain)' : 'var(--loss)';
}

// ── Overview ──
function renderOverview() {
  const c = State.computed;
  const segs = [
    { label:'Indian Stocks+ETFs', value: fmtINR(c.indStCurrent), sub: fmtPct(c.indStPlPct), pos: c.indStPL >= 0 },
    { label:'Indian MFs',         value: fmtINR(c.mfCurrent),    sub: fmtPct(c.mfPlPct),    pos: c.mfPL >= 0 },
    { label:'US Holdings (INR)',   value: fmtINR(c.usCurINR),     sub: fmtPct(c.usPlPct),    pos: c.usPLINR >= 0 },
    { label:'Total P&L',          value: fmtINR(c.totPL),         sub: fmtPct(c.totPlPct),   pos: c.totPL >= 0 },
  ];
  document.getElementById('segGrid').innerHTML = segs.map(s =>
    '<div class="seg-card">' +
    '<div class="seg-label">' + s.label + '</div>' +
    '<div class="seg-value">' + s.value + '</div>' +
    '<div class="seg-sub" style="color:' + (s.pos ? 'var(--gain)' : 'var(--loss)') + '">' + s.sub + '</div>' +
    '</div>'
  ).join('');

  // Allocation donut
  const allocColors = ['#4f7cac','#2ec4a9','#e8a44a'];
  const allocData   = [c.indStCurrent, c.mfCurrent, c.usCurINR];
  const allocLabels = ['Indian Stocks+ETFs','Indian MFs','US Holdings'];
  const allocLeg    = document.getElementById('allocLegend');
  const total       = allocData.reduce((a,b)=>a+b,0);
  allocLeg.innerHTML = allocLabels.map((l,i) =>
    '<span><span class="leg-sq" style="background:' + allocColors[i] + '"></span>' +
    l + ' ' + (total > 0 ? (allocData[i]/total*100).toFixed(1) : 0) + '%</span>'
  ).join('');

  destroyChart('allocChart');
  State.charts.allocChart = new Chart(document.getElementById('allocChart'), {
    type: 'doughnut',
    data: { labels: allocLabels, datasets: [{ data: allocData, backgroundColor: allocColors, borderWidth: 0 }] },
    options: { responsive:true, maintainAspectRatio:false, cutout:'62%', plugins:{ legend:{ display:false } } }
  });

  // Bar chart
  destroyChart('perfChart');
  State.charts.perfChart = new Chart(document.getElementById('perfChart'), {
    type: 'bar',
    data: {
      labels: ['Indian Stocks+ETFs','Indian MFs','US (INR)'],
      datasets: [
        { label:'Invested', data:[c.indStInvested, c.mfInvested, c.usInvINR], backgroundColor:'#4f7cac' },
        { label:'Current',  data:[c.indStCurrent,  c.mfCurrent,  c.usCurINR], backgroundColor:'#2ec4a9' }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ticks:{ color:'#555d6e', font:{size:11} }, grid:{ color:'rgba(255,255,255,0.04)' } },
        y:{ ticks:{ color:'#555d6e', font:{size:11}, callback: v => fmtINR(v) }, grid:{ color:'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

// ── Indian Stocks ──
function renderIndianStocks(stocks, etfs) {
  const c = State.computed;
  const segs = [
    { label:'ICICI Stocks', value: fmtINR(State.data.icici.summary.current), sub: fmtPct(State.data.icici.summary.plPct), pos: State.data.icici.summary.pl >= 0 },
    { label:'Zerodha ETFs', value: fmtINR(c.etfCurrent || State.data.zerodha.equityEtfs.reduce((s,r)=>s+r.currentValue,0)), sub: fmtPct(c.etfPlPct || 0), pos: true },
    { label:'Combined Invested', value: fmtINR(c.indStInvested), sub: '', pos: true },
    { label:'Combined Return',   value: fmtPct(c.indStPlPct), sub: 'unrealized', pos: c.indStPL >= 0 },
  ];
  // patch etf values
  const etfCur = etfs.reduce((s,r)=>s+r.currentValue,0);
  const etfInv = etfs.reduce((s,r)=>s+r.invested,0);
  const etfPL  = etfs.reduce((s,r)=>s+r.pl,0);
  segs[1].value = fmtINR(etfCur);
  segs[1].sub   = fmtPct(etfInv > 0 ? etfPL/etfInv*100 : 0);

  document.getElementById('stockSegGrid').innerHTML = segs.map(s =>
    '<div class="seg-card"><div class="seg-label">' + s.label + '</div>' +
    '<div class="seg-value">' + s.value + '</div>' +
    '<div class="seg-sub" style="color:' + (s.pos ? 'var(--gain)' : 'var(--loss)') + '">' + s.sub + '</div></div>'
  ).join('');

  const allStocks = [
    ...stocks.map(s => ({...s, isEtf: false})),
    ...etfs.map(e => ({
      symbol: e.symbol, name: e.symbol, qty: e.qty,
      avgPrice: e.avgPrice, cmp: e.cmp,
      invested: e.invested, currentValue: e.currentValue,
      pl: e.pl, plPct: e.plPct, source: e.source, isEtf: true
    }))
  ];

  const tbody = document.getElementById('stockBody');
  tbody.innerHTML = allStocks.map(s => {
    const pos = s.pl >= 0;
    const srcPill = s.source === 'icici'
      ? '<span class="source-pill pill-icici">ICICI</span>'
      : '<span class="source-pill pill-zerodha">ZRD ETF</span>';
    return '<tr class="' + (s.isEtf ? 'etf-row' : '') + '" data-search="' + (s.name + ' ' + s.symbol).toLowerCase() + '">' +
      '<td>' + (s.name || s.symbol) + '</td>' +
      '<td style="font-family:var(--font-mono);font-size:12px">' + s.symbol + '</td>' +
      '<td class="num">' + s.qty.toLocaleString('en-IN') + '</td>' +
      '<td class="num">₹' + s.avgPrice.toFixed(2) + '</td>' +
      '<td class="num">₹' + s.cmp.toFixed(2) + '</td>' +
      '<td class="num">₹' + Math.round(s.currentValue).toLocaleString('en-IN') + '</td>' +
      '<td class="num" style="color:var(--' + (pos?'gain':'loss') + ')">' + (pos?'+':'') + '₹' + Math.round(Math.abs(s.pl)).toLocaleString('en-IN') + '</td>' +
      '<td class="num"><span class="badge badge-' + (pos?'gain':'loss') + '">' + fmtPct(s.plPct) + '</span></td>' +
      '<td class="num">' + srcPill + '</td>' +
      '</tr>';
  }).join('');
}

// ── Indian MFs ──
function renderIndianMFs(mfs) {
  const inv = State.computed.mfInvested;
  const cur = State.computed.mfCurrent;
  const pl  = State.computed.mfPL;

  document.getElementById('mfSegGrid').innerHTML = [
    { label:'Invested (statement)', value: fmtINR(inv), sub:'', pos:true },
    { label:'Current Value',        value: fmtINR(cur), sub:'', pos:true },
    { label:'Total Gain',           value: fmtINR(pl),  sub:'unrealized', pos: pl>=0 },
    { label:'Overall Return',       value: fmtPct(State.computed.mfPlPct), sub:'', pos: pl>=0 },
  ].map(s =>
    '<div class="seg-card"><div class="seg-label">' + s.label + '</div>' +
    '<div class="seg-value" style="color:' + (s.pos?'var(--gain)':'var(--loss)') + '">' + s.value + '</div>' +
    '<div class="seg-sub" style="color:var(--text3)">' + s.sub + '</div></div>'
  ).join('');

  document.getElementById('mfBody').innerHTML = mfs.map(m => {
    return '<tr>' +
      '<td>' + m.name + '</td>' +
      '<td><span class="source-pill pill-zerodha">' + m.type + '</span></td>' +
      '<td class="num">' + m.units.toFixed(3) + '</td>' +
      '<td class="num">₹' + m.avgNAV.toFixed(4) + '</td>' +
      '<td class="num">₹' + m.currNAV.toFixed(4) + '</td>' +
      '<td class="num">₹' + Math.round(m.currentValue).toLocaleString('en-IN') + '</td>' +
      '<td class="num" style="color:var(--gain)">+₹' + Math.round(m.pl).toLocaleString('en-IN') + '</td>' +
      '<td class="num"><span class="badge badge-gain">' + fmtPct(m.plPct) + '</span></td>' +
      '</tr>';
  }).join('');

  // MF bar chart - sorted by return
  const sorted = [...mfs].sort((a,b) => b.plPct - a.plPct);
  const labels  = sorted.map(m => m.name.replace('MOTILAL OSWAL ','MO ').replace(' FUND - DIRECT PLAN','').replace(' INDEX FUND - DIRECT PLAN','').replace(' FUND OF FUND - DIRECT PLAN',' FOF'));
  const data    = sorted.map(m => parseFloat(m.plPct.toFixed(2)));
  const bgColors = data.map(v => v >= 50 ? '#2ec4a9' : v >= 20 ? '#4f7cac' : '#6a7f9a');

  destroyChart('mfBarChart');
  const h = Math.max(220, sorted.length * 42);
  document.querySelector('#mfBarChart').parentElement.style.height = h + 'px';
  State.charts.mfBarChart = new Chart(document.getElementById('mfBarChart'), {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: bgColors, borderWidth:0, borderRadius:4 }] },
    options: {
      indexAxis: 'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ticks:{ color:'#555d6e', callback: v => v+'%' }, grid:{ color:'rgba(255,255,255,0.04)' } },
        y:{ ticks:{ color:'#8a91a0', font:{size:12} }, grid:{ display:false } }
      }
    }
  });
}

// ── US Holdings ──
function renderUS(holdings) {
  const inv = State.data.vested.summary.invested;
  const cur = State.data.vested.summary.current;
  const pl  = State.data.vested.summary.pl;
  const pct = State.data.vested.summary.plPct;

  document.getElementById('usSegGrid').innerHTML = [
    { label:'Invested (USD)',  value: fmtUSD(inv),  sub: '', pos:true },
    { label:'Current (USD)',   value: fmtUSD(cur),  sub: '', pos:true },
    { label:'P&L (USD)',       value: (pl>=0?'+':'') + fmtUSD(pl), sub:'', pos: pl>=0 },
    { label:'Overall Return',  value: fmtPct(pct),  sub: 'USD basis', pos: pl>=0 },
  ].map(s =>
    '<div class="seg-card"><div class="seg-label">' + s.label + '</div>' +
    '<div class="seg-value" style="color:' + (s.pos?'var(--gain)':'var(--loss)') + '">' + s.value + '</div>' +
    '<div class="seg-sub" style="color:var(--text3)">' + s.sub + '</div></div>'
  ).join('');

  const sorted = [...holdings].sort((a,b) => b.plPct - a.plPct);
  document.getElementById('usBody').innerHTML = sorted.map(h => {
    const pos = h.pl >= 0;
    return '<tr data-search="' + (h.name + ' ' + h.ticker).toLowerCase() + '">' +
      '<td>' + h.name + '</td>' +
      '<td style="font-family:var(--font-mono);font-size:12px">' + h.ticker + '</td>' +
      '<td class="num">' + h.shares.toFixed(3) + '</td>' +
      '<td class="num">$' + h.avgCost.toFixed(2) + '</td>' +
      '<td class="num">$' + h.cmp.toFixed(2) + '</td>' +
      '<td class="num">$' + h.currentValue.toFixed(2) + '</td>' +
      '<td class="num" style="color:var(--' + (pos?'gain':'loss') + ')">' + (pos?'+':'-') + '$' + Math.abs(h.pl).toFixed(2) + '</td>' +
      '<td class="num"><span class="badge badge-' + (pos?'gain':'loss') + '">' + fmtPct(h.plPct) + '</span></td>' +
      '</tr>';
  }).join('');
}

// ── Top Movers ──
function renderMovers(stocks, etfs, usHoldings, mfs) {
  const allIndian = [
    ...stocks.map(s => ({ name: s.name || s.symbol, ret: s.plPct })),
    ...etfs.map(e => ({ name: e.symbol + ' (ETF)', ret: e.plPct }))
  ];
  const topGain = [...allIndian].sort((a,b) => b.ret - a.ret).slice(0,6);
  const topLoss = [...allIndian].sort((a,b) => a.ret - b.ret).slice(0,6);
  const usGain  = [...usHoldings].sort((a,b) => b.plPct - a.plPct).slice(0,6);
  const mfSorted = [...mfs].sort((a,b) => b.plPct - a.plPct);

  renderBars('indGainers', topGain.map(r => [r.name, r.ret]),
    Math.max(...topGain.map(r=>r.ret)), 'var(--gain)');
  renderBars('indLosers', topLoss.map(r => [r.name, r.ret]),
    Math.max(...topLoss.map(r=>Math.abs(r.ret))), 'var(--loss)');
  renderBars('usGainers', usGain.map(r => [r.name || r.ticker, r.plPct]),
    Math.max(...usGain.map(r=>r.plPct)), 'var(--gain)');
  renderBars('mfMovers', mfSorted.map(m => {
    const shortName = m.name.replace('MOTILAL OSWAL ','MO ').replace(' FUND - DIRECT PLAN','').replace(' INDEX FUND - DIRECT PLAN','').replace(' FUND OF FUND - DIRECT PLAN',' FOF');
    return [shortName, m.plPct];
  }), Math.max(...mfSorted.map(m=>m.plPct)), '#4f7cac');
}

function renderBars(containerId, data, maxVal, color) {
  const el = document.getElementById(containerId);
  el.innerHTML = data.map(([name, val]) => {
    const pct = maxVal > 0 ? Math.min(Math.abs(val)/maxVal*100, 100).toFixed(1) : 0;
    const valColor = val >= 0 ? 'var(--gain)' : 'var(--loss)';
    return '<div class="bar-row">' +
      '<div class="bar-name" title="' + name + '">' + name + '</div>' +
      '<div class="bar-bg"><div class="bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '<div class="bar-val" style="color:' + valColor + '">' + fmtPct(val) + '</div>' +
      '</div>';
  }).join('');
}

// ── Tab switching ──
function switchTab(btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
}

// ── Table filter ──
function filterTable(tableId, query) {
  const q = query.toLowerCase();
  document.getElementById(tableId).querySelectorAll('tbody tr').forEach(tr => {
    const text = tr.dataset.search || tr.textContent.toLowerCase();
    tr.style.display = text.includes(q) ? '' : 'none';
  });
}

// ── Table sort ──
const sortState = {};
function sortTable(tableId, colIdx) {
  const table = document.getElementById(tableId);
  const tbody = table.querySelector('tbody');
  const rows  = Array.from(tbody.querySelectorAll('tr'));
  const key   = tableId + '_' + colIdx;
  const asc   = !sortState[key]; sortState[key] = asc;

  rows.sort((a, b) => {
    const av = a.cells[colIdx]?.textContent.trim().replace(/[₹$+%,]/g,'').replace('Cr','e7').replace('L','e5') || '';
    const bv = b.cells[colIdx]?.textContent.trim().replace(/[₹$+%,]/g,'').replace('Cr','e7').replace('L','e5') || '';
    const an = parseFloat(av), bn = parseFloat(bv);
    if (!isNaN(an) && !isNaN(bn)) return asc ? an - bn : bn - an;
    return asc ? av.localeCompare(bv) : bv.localeCompare(av);
  });
  rows.forEach(r => tbody.appendChild(r));
}

// ── Destroy chart helper ──
function destroyChart(id) {
  if (State.charts[id]) { try { State.charts[id].destroy(); } catch(e){} delete State.charts[id]; }
}
