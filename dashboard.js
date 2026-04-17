/**
 * dashboard.js — App logic: file handling, folder access, parsing, rendering
 */

const State = {
  files:   { zerodha: null, icici: null, vested: null },
  data:    { zerodha: null, icici: null, vested: null },
  mode:    'manual',
  usdInr:  84,
  charts:  {}
};

// ── Mode toggle ──
function setMode(mode) {
  State.mode = mode;
  document.getElementById('modeManual').classList.toggle('active', mode === 'manual');
  document.getElementById('modeFolder').classList.toggle('active', mode === 'folder');
  document.getElementById('manualMode').style.display = mode === 'manual' ? 'block' : 'none';
  document.getElementById('folderMode').style.display = mode === 'folder'  ? 'block' : 'none';
  checkReadyState();
}

// ── FOLDER MODE: select folder via File System Access API ──
async function selectFolder() {
  // Check browser support
  if (!window.showDirectoryPicker) {
    document.getElementById('folderBrowserNote').style.display = 'block';
    document.getElementById('folderZone').style.display = 'none';
    return;
  }

  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    const statusGrid = document.getElementById('folderStatus');
    statusGrid.innerHTML = '<div style="font-size:12px;color:var(--text2);margin-bottom:8px">Reading files from folder...</div>';

    const found = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind !== 'file') continue;
      const name = entry.name.toLowerCase();
      if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) continue;
      if (name.startsWith('.') || name.startsWith('~')) continue;
      found.push({ entry, name: entry.name });
    }

    if (found.length === 0) {
      statusGrid.innerHTML = '<div class="browser-note">No .xlsx / .xls / .csv files found in this folder.</div>';
      return;
    }

    // Read each file and auto-detect broker
    statusGrid.innerHTML = '';
    const detected = {};

    for (const { entry, name } of found) {
      const file = await entry.getFile();
      const ab   = await file.arrayBuffer();
      const broker = Parsers.detectBroker(ab, name);

      const row = document.createElement('div');
      row.className = 'folder-file-row';

      if (!broker) {
        row.classList.add('err');
        row.innerHTML = '<span class="frow-broker">Unknown</span>' +
          '<span class="frow-name">' + name + '</span>' +
          '<span class="frow-status err">⚠ Could not identify broker</span>';
        statusGrid.appendChild(row);
        continue;
      }

      if (detected[broker]) {
        row.classList.add('err');
        row.innerHTML = '<span class="frow-broker">' + broker.toUpperCase() + '</span>' +
          '<span class="frow-name">' + name + '</span>' +
          '<span class="frow-status err">⚠ Duplicate — skipped</span>';
        statusGrid.appendChild(row);
        continue;
      }

      try {
        const parsed = broker === 'icici' ? Parsers.icici(ab) : Parsers[broker](ab);
        State.data[broker]  = parsed;
        State.files[broker] = name;
        detected[broker]    = true;

        const brokerColors = { zerodha:'#387ed1', icici:'#f47920', vested:'#00b386' };
        row.classList.add('ok');
        row.innerHTML = '<span class="frow-broker" style="color:' + brokerColors[broker] + '">' + broker.toUpperCase() + '</span>' +
          '<span class="frow-name">' + name + '</span>' +
          '<span class="frow-status ok">✓ Loaded</span>';
      } catch(err) {
        row.classList.add('err');
        row.innerHTML = '<span class="frow-broker">' + broker.toUpperCase() + '</span>' +
          '<span class="frow-name">' + name + '</span>' +
          '<span class="frow-status err">✗ ' + err.message + '</span>';
      }
      statusGrid.appendChild(row);
    }

    checkReadyState();
  } catch(err) {
    if (err.name !== 'AbortError') {
      document.getElementById('folderStatus').innerHTML =
        '<div class="browser-note">Error: ' + err.message + '</div>';
    }
  }
}

// ── MANUAL MODE: handle individual file upload ──
function handleFile(broker, input) {
  const file = input.files[0]; if (!file) return;
  const statusEl = document.getElementById('status-' + broker);
  const cardEl   = document.getElementById('card-' + broker);
  statusEl.className = 'file-status';
  statusEl.textContent = '⏳ Reading…';

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const ab = e.target.result;
      const parsed = broker === 'icici' ? Parsers.icici(ab) : Parsers[broker](ab);
      State.data[broker]  = parsed;
      State.files[broker] = file.name;
      statusEl.textContent = '✓ ' + file.name;
      cardEl.classList.add('loaded');
      checkReadyState();
    } catch(err) {
      statusEl.className = 'file-status error';
      statusEl.textContent = '✗ ' + err.message;
    }
  };
  reader.readAsArrayBuffer(file);
}

// Drag & drop for manual mode
['zerodha','icici','vested'].forEach(broker => {
  setTimeout(() => {
    const zone = document.getElementById('drop-' + broker); if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0]; if (!file) return;
      const input = document.getElementById('file-' + broker);
      const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
      handleFile(broker, input);
    });
  }, 100);
});

function checkReadyState() {
  const ready = State.data.zerodha && State.data.icici && State.data.vested;
  document.getElementById('btnAnalyze').disabled = !ready;
}

function resetApp() {
  ['zerodha','icici','vested'].forEach(b => {
    State.data[b] = null; State.files[b] = null;
    const s = document.getElementById('status-' + b); if(s) s.textContent = '';
    const c = document.getElementById('card-' + b);   if(c) c.classList.remove('loaded');
    const f = document.getElementById('file-' + b);   if(f) f.value = '';
  });
  document.getElementById('folderStatus').innerHTML = '';
  Object.values(State.charts).forEach(c => { try { c.destroy(); } catch(e){} });
  State.charts = {};
  document.getElementById('btnAnalyze').disabled = true;
  document.getElementById('uploadScreen').classList.add('active');
  document.getElementById('dashScreen').classList.remove('active');
  setMode('manual');
}

// ── Formatting helpers ──
const fmtINR = (v) => {
  const abs = Math.abs(v), sign = v < 0 ? '-' : '';
  if (abs >= 1e7) return sign + '₹' + (abs/1e7).toFixed(2) + 'Cr';
  if (abs >= 1e5) return sign + '₹' + (abs/1e5).toFixed(2) + 'L';
  return sign + '₹' + Math.round(abs).toLocaleString('en-IN');
};
const fmtUSD = (v) => (v<0?'-':'') + '$' + Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtPct = (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
const badge  = (ret) => '<span class="badge badge-' + (ret>=0?'gain':'loss') + '">' + fmtPct(ret) + '</span>';
const plColor= (v) => v >= 0 ? 'var(--gain)' : 'var(--loss)';

// ── Build dashboard ──
function buildDashboard() {
  State.usdInr = parseFloat(document.getElementById('usdInr').value) || 84;
  const z = State.data.zerodha, ic = State.data.icici, vs = State.data.vested;

  // MF — use statement summary directly (most accurate)
  const mfInv = z.summaryMF.invested || 0;
  const mfCur = z.summaryMF.current  || 0;
  const mfPL  = z.summaryMF.pl       || 0;
  const mfPct = z.summaryMF.plPct    || (mfInv > 0 ? mfPL/mfInv*100 : 0);

  // Zerodha Equity summary minus DEBT = ETFs only
  const debtInv = z.debtRows.reduce((s,r)=>s+r.invested,0);
  const debtCur = z.debtRows.reduce((s,r)=>s+r.currentValue,0);
  const debtPL  = z.debtRows.reduce((s,r)=>s+r.pl,0);
  const etfInv  = (z.summaryEq.invested||0) - debtInv;
  const etfCur  = (z.summaryEq.current ||0) - debtCur;
  const etfPL   = (z.summaryEq.pl      ||0) - debtPL;

  // Indian Stocks+ETFs
  const indInv = ic.summary.invested + etfInv;
  const indCur = ic.summary.current  + etfCur;
  const indPL  = ic.summary.pl       + etfPL;
  const indPct = indInv > 0 ? indPL/indInv*100 : 0;

  // US in INR
  const usInvINR = vs.summary.invested * State.usdInr;
  const usCurINR = vs.summary.current  * State.usdInr;
  const usPLINR  = vs.summary.pl       * State.usdInr;
  const usPct    = vs.summary.plPct;

  // Totals
  const totInv = indInv + mfInv + usInvINR;
  const totCur = indCur + mfCur + usCurINR;
  const totPL  = indPL  + mfPL  + usPLINR;
  const totPct = totInv > 0 ? totPL/totInv*100 : 0;

  State.computed = { indInv,indCur,indPL,indPct, mfInv,mfCur,mfPL,mfPct,
                     usInvINR,usCurINR,usPLINR,usPct, totInv,totCur,totPL,totPct,
                     etfInv,etfCur,etfPL };

  document.getElementById('uploadScreen').classList.remove('active');
  document.getElementById('dashScreen').classList.add('active');
  document.getElementById('headerDate').textContent = 'As of ' +
    new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});

  renderSummary(totInv, totCur, totPL, totPct);
  renderOverview();
  renderIndianStocks(ic.stocks, z.equityEtfs);
  renderIndianMFs(z.mutualFunds);
  renderUS(vs.holdings);
  renderMovers(ic.stocks, z.equityEtfs, vs.holdings, z.mutualFunds);
}

function renderSummary(inv, cur, pl, pct) {
  document.getElementById('sumInvested').textContent = fmtINR(inv);
  document.getElementById('sumCurrent').textContent  = fmtINR(cur);
  const plEl = document.getElementById('sumPL');
  plEl.textContent = (pl>=0?'+':'') + fmtINR(pl); plEl.style.color = plColor(pl);
  const retEl = document.getElementById('sumReturn');
  retEl.textContent = fmtPct(pct); retEl.style.color = plColor(pct);
}

function segCard(label, value, sub, pos) {
  return '<div class="seg-card"><div class="seg-label">' + label + '</div>' +
    '<div class="seg-value">' + value + '</div>' +
    '<div class="seg-sub" style="color:' + (pos?'var(--gain)':'var(--loss)') + '">' + sub + '</div></div>';
}

function renderOverview() {
  const c = State.computed;
  document.getElementById('segGrid').innerHTML =
    segCard('Indian Stocks+ETFs', fmtINR(c.indCur), fmtPct(c.indPct), c.indPL>=0) +
    segCard('Indian MFs',         fmtINR(c.mfCur),  fmtPct(c.mfPct),  c.mfPL>=0) +
    segCard('US Holdings (INR)',   fmtINR(c.usCurINR), fmtPct(c.usPct), c.usPLINR>=0) +
    segCard('Total P&L',          fmtINR(c.totPL),  fmtPct(c.totPct), c.totPL>=0);

  const allocColors = ['#4f7cac','#2ec4a9','#e8a44a'];
  const allocData   = [c.indCur, c.mfCur, c.usCurINR];
  const allocLabels = ['Indian Stocks+ETFs','Indian MFs','US Holdings'];
  const total = allocData.reduce((a,b)=>a+b,0);
  document.getElementById('allocLegend').innerHTML = allocLabels.map((l,i) =>
    '<span><span class="leg-sq" style="background:'+allocColors[i]+'"></span>'+l+' '+(total>0?(allocData[i]/total*100).toFixed(1):0)+'%</span>'
  ).join('');

  destroyChart('allocChart');
  State.charts.allocChart = new Chart(document.getElementById('allocChart'), {
    type:'doughnut',
    data:{ labels:allocLabels, datasets:[{ data:allocData, backgroundColor:allocColors, borderWidth:0 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'62%', plugins:{ legend:{ display:false } } }
  });

  destroyChart('perfChart');
  State.charts.perfChart = new Chart(document.getElementById('perfChart'), {
    type:'bar',
    data:{
      labels:['Indian Stocks+ETFs','Indian MFs','US (INR)'],
      datasets:[
        { label:'Invested', data:[c.indInv, c.mfInv, c.usInvINR], backgroundColor:'#4f7cac' },
        { label:'Current',  data:[c.indCur, c.mfCur, c.usCurINR], backgroundColor:'#2ec4a9' }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ticks:{ color:'#8a91a0', font:{size:11} }, grid:{ color:'rgba(255,255,255,0.04)' } },
        y:{ ticks:{ color:'#8a91a0', font:{size:11}, callback:v=>fmtINR(v) }, grid:{ color:'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

function renderIndianStocks(stocks, etfs) {
  const c = State.computed;
  const etfPct = c.etfInv > 0 ? c.etfPL/c.etfInv*100 : 0;
  document.getElementById('stockSegGrid').innerHTML =
    segCard('ICICI Stocks', fmtINR(State.data.icici.summary.current), fmtPct(State.data.icici.summary.plPct), State.data.icici.summary.pl>=0) +
    segCard('Zerodha ETFs', fmtINR(c.etfCur), fmtPct(etfPct), c.etfPL>=0) +
    segCard('Combined Invested', fmtINR(c.indInv), '', true) +
    segCard('Combined Return', fmtPct(c.indPct), 'unrealized', c.indPL>=0);

  const all = [
    ...stocks.map(s => ({...s, isEtf:false})),
    ...etfs.map(e => ({ symbol:e.symbol, name:e.symbol, qty:e.qty, avgPrice:e.avgPrice, cmp:e.cmp,
                        invested:e.invested, currentValue:e.currentValue, pl:e.pl, plPct:e.plPct, source:'zerodha', isEtf:true }))
  ];

  document.getElementById('stockBody').innerHTML = all.map(s => {
    const pill = s.source==='icici'
      ? '<span class="source-pill pill-icici">ICICI</span>'
      : '<span class="source-pill pill-zerodha">ZRD ETF</span>';
    return '<tr class="'+(s.isEtf?'etf-row':'')+'" data-search="'+(s.name+' '+s.symbol).toLowerCase()+'">' +
      '<td>'+s.name+'</td>' +
      '<td style="font-family:var(--font-mono);font-size:12px">'+s.symbol+'</td>' +
      '<td class="num">'+s.qty.toLocaleString('en-IN')+'</td>' +
      '<td class="num">₹'+s.avgPrice.toFixed(2)+'</td>' +
      '<td class="num">₹'+s.cmp.toFixed(2)+'</td>' +
      '<td class="num">₹'+Math.round(s.currentValue).toLocaleString('en-IN')+'</td>' +
      '<td class="num" style="color:'+plColor(s.pl)+'">'+(s.pl>=0?'+':'-')+'₹'+Math.round(Math.abs(s.pl)).toLocaleString('en-IN')+'</td>' +
      '<td class="num">'+badge(s.plPct)+'</td>' +
      '<td class="num">'+pill+'</td></tr>';
  }).join('');
}

function renderIndianMFs(mfs) {
  const c = State.computed;
  document.getElementById('mfSegGrid').innerHTML =
    segCard('Invested (statement)', fmtINR(c.mfInv), '', true) +
    segCard('Current Value',        fmtINR(c.mfCur), '', true) +
    segCard('Total Gain',           fmtINR(c.mfPL),  'unrealized', c.mfPL>=0) +
    segCard('Overall Return',       fmtPct(c.mfPct), '', c.mfPL>=0);

  document.getElementById('mfBody').innerHTML = mfs.map(m =>
    '<tr><td>'+m.name+'</td>' +
    '<td><span class="source-pill pill-zerodha">'+m.type+'</span></td>' +
    '<td class="num">'+m.units.toFixed(3)+'</td>' +
    '<td class="num">₹'+m.avgNAV.toFixed(4)+'</td>' +
    '<td class="num">₹'+m.currNAV.toFixed(4)+'</td>' +
    '<td class="num">₹'+Math.round(m.currentValue).toLocaleString('en-IN')+'</td>' +
    '<td class="num" style="color:var(--gain)">+₹'+Math.round(m.pl).toLocaleString('en-IN')+'</td>' +
    '<td class="num">'+badge(m.plPct)+'</td></tr>'
  ).join('');

  const sorted = [...mfs].sort((a,b)=>b.plPct-a.plPct);
  const shortName = n => n.replace('MOTILAL OSWAL ','MO ').replace(/ FUND - DIRECT PLAN$/,'').replace(/ INDEX FUND - DIRECT PLAN$/,'').replace(/ FUND OF FUND - DIRECT PLAN$/,' FOF');
  const h = Math.max(220, sorted.length*42);
  document.querySelector('#mfBarChart').parentElement.style.height = h+'px';
  destroyChart('mfBarChart');
  State.charts.mfBarChart = new Chart(document.getElementById('mfBarChart'), {
    type:'bar',
    data:{ labels:sorted.map(m=>shortName(m.name)),
           datasets:[{ data:sorted.map(m=>parseFloat(m.plPct.toFixed(2))),
                       backgroundColor:sorted.map(m=>m.plPct>=50?'#2ec4a9':m.plPct>=20?'#4f7cac':'#6a7f9a'),
                       borderWidth:0, borderRadius:4 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{ x:{ ticks:{ color:'#8a91a0', callback:v=>v+'%' }, grid:{ color:'rgba(255,255,255,0.04)' } },
               y:{ ticks:{ color:'#8a91a0', font:{size:12} }, grid:{ display:false } } } }
  });
}

function renderUS(holdings) {
  const vs = State.data.vested.summary;
  document.getElementById('usSegGrid').innerHTML =
    segCard('Invested (USD)', fmtUSD(vs.invested), '', true) +
    segCard('Current (USD)',  fmtUSD(vs.current),  '', true) +
    segCard('P&L (USD)',      (vs.pl>=0?'+':'')+fmtUSD(vs.pl), '', vs.pl>=0) +
    segCard('Overall Return', fmtPct(vs.plPct), 'USD basis', vs.pl>=0);

  document.getElementById('usBody').innerHTML = [...holdings].sort((a,b)=>b.plPct-a.plPct).map(h =>
    '<tr data-search="'+(h.name+' '+h.ticker).toLowerCase()+'">' +
    '<td>'+h.name+'</td>' +
    '<td style="font-family:var(--font-mono);font-size:12px">'+h.ticker+'</td>' +
    '<td class="num">'+h.shares.toFixed(3)+'</td>' +
    '<td class="num">$'+h.avgCost.toFixed(2)+'</td>' +
    '<td class="num">$'+h.cmp.toFixed(2)+'</td>' +
    '<td class="num">$'+h.currentValue.toFixed(2)+'</td>' +
    '<td class="num" style="color:'+plColor(h.pl)+'">'+(h.pl>=0?'+':'-')+'$'+Math.abs(h.pl).toFixed(2)+'</td>' +
    '<td class="num">'+badge(h.plPct)+'</td></tr>'
  ).join('');
}

function renderMovers(stocks, etfs, usHoldings, mfs) {
  const allInd = [
    ...stocks.map(s=>({name:s.name||s.symbol, ret:s.plPct})),
    ...etfs.map(e=>({name:e.symbol+' (ETF)', ret:e.plPct}))
  ];
  const topG   = [...allInd].sort((a,b)=>b.ret-a.ret).slice(0,6);
  const topL   = [...allInd].sort((a,b)=>a.ret-b.ret).slice(0,6);
  const usG    = [...usHoldings].sort((a,b)=>b.plPct-a.plPct).slice(0,6);
  const mfSort = [...mfs].sort((a,b)=>b.plPct-a.plPct);
  const sn = n => n.replace('MOTILAL OSWAL ','MO ').replace(/ FUND - DIRECT PLAN$/,'').replace(/ INDEX FUND - DIRECT PLAN$/,'').replace(/ FUND OF FUND - DIRECT PLAN$/,' FOF');

  renderBars('indGainers', topG.map(r=>[r.name,r.ret]), Math.max(...topG.map(r=>Math.abs(r.ret))), 'var(--gain)');
  renderBars('indLosers',  topL.map(r=>[r.name,r.ret]), Math.max(...topL.map(r=>Math.abs(r.ret))), 'var(--loss)');
  renderBars('usGainers',  usG.map(r=>[r.name||r.ticker,r.plPct]), Math.max(...usG.map(r=>r.plPct)), 'var(--gain)');
  renderBars('mfMovers',   mfSort.map(m=>[sn(m.name),m.plPct]), Math.max(...mfSort.map(m=>m.plPct)), '#4f7cac');
}

function renderBars(id, data, maxVal, color) {
  document.getElementById(id).innerHTML = data.map(([name, val]) => {
    const pct = maxVal > 0 ? Math.min(Math.abs(val)/maxVal*100, 100).toFixed(1) : 0;
    return '<div class="bar-row">' +
      '<div class="bar-name" title="'+name+'">'+name+'</div>' +
      '<div class="bar-bg"><div class="bar-fill" style="width:'+pct+'%;background:'+color+'"></div></div>' +
      '<div class="bar-val" style="color:'+plColor(val)+'">'+fmtPct(val)+'</div></div>';
  }).join('');
}

function switchTab(btn) {
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-'+btn.dataset.tab).classList.add('active');
}

function filterTable(id, q) {
  document.getElementById(id).querySelectorAll('tbody tr').forEach(tr => {
    tr.style.display = (tr.dataset.search||tr.textContent.toLowerCase()).includes(q.toLowerCase()) ? '' : 'none';
  });
}

const sortState = {};
function sortTable(id, col) {
  const tbody = document.getElementById(id).querySelector('tbody');
  const rows  = Array.from(tbody.querySelectorAll('tr'));
  const key   = id+'_'+col, asc = !sortState[key]; sortState[key] = asc;
  rows.sort((a,b) => {
    const av = (a.cells[col]?.textContent||'').trim().replace(/[₹$+%,]/g,'');
    const bv = (b.cells[col]?.textContent||'').trim().replace(/[₹$+%,]/g,'');
    const an = parseFloat(av), bn = parseFloat(bv);
    if (!isNaN(an)&&!isNaN(bn)) return asc?an-bn:bn-an;
    return asc?av.localeCompare(bv):bv.localeCompare(av);
  });
  rows.forEach(r=>tbody.appendChild(r));
}

function destroyChart(id) {
  if (State.charts[id]) { try { State.charts[id].destroy(); } catch(e){} delete State.charts[id]; }
}
