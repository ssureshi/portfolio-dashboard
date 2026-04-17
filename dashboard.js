/**
 * dashboard.js — App logic: file handling, folder access, parsing, rendering
 */

const State = {
  files:   { zerodha:null, icici:null, vested:null },
  data:    { zerodha:null, icici:null, vested:null },
  mode:    'manual',
  usdInr:  84,
  charts:  {},
  // Store original row order for sort-reset
  origRows: {}
};

// ── THEME ──
(function(){
  const saved = localStorage.getItem('plTheme') || 'light';
  applyTheme(saved, false);
})();

function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(cur === 'light' ? 'dark' : 'light', true);
}

function applyTheme(theme, save){
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';
  const icon   = isDark ? '☾' : '☀';
  const label  = isDark ? 'Dark' : 'Light';
  ['Upload','Dash'].forEach(id => {
    const ic = document.getElementById('themeIcon'+id);  if(ic) ic.textContent = icon;
    const lb = document.getElementById('themeLabel'+id); if(lb) lb.textContent = label;
  });
  if(save) localStorage.setItem('plTheme', theme);
  // Redraw charts if dashboard visible
  if(document.getElementById('dashScreen').classList.contains('active') && State.computed){
    Object.values(State.charts).forEach(c=>{ try{c.destroy();}catch(e){} });
    State.charts = {};
    renderOverview();
    renderIndianMFs(State.data.zerodha.mutualFunds);
  }
}

function getChartColors(){
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    grid:  dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
    text:  dark ? '#8890a8' : '#666666',
    gain:  dark ? '#2ec4a9' : '#0e7c6e',
    blue:  dark ? '#5b8fd4' : '#4068a0',
    alloc: [dark?'#4068a0':'#3a6fa0', dark?'#2ec4a9':'#0e7c6e', dark?'#d4924a':'#b07030'],
  };
}

// ── MODE ──
function setMode(mode){
  State.mode = mode;
  ['drive','folder','manual'].forEach(m => {
    const btn = document.getElementById('mode'+m.charAt(0).toUpperCase()+m.slice(1));
    if(btn) btn.classList.toggle('active', m===mode);
    const div = document.getElementById(m+'Mode');
    if(div) div.style.display = m===mode ? 'block' : 'none';
  });
  checkReadyState();
  if(mode === 'drive') driveInit();
}

// ── FOLDER MODE ──
async function selectFolder(){
  if(!window.showDirectoryPicker){
    document.getElementById('folderBrowserNote').style.display = 'block';
    document.getElementById('folderZone').style.display = 'none';
    return;
  }
  try {
    const dirHandle = await window.showDirectoryPicker({ mode:'read' });
    const grid = document.getElementById('folderStatus');
    grid.innerHTML = '<div style="font-size:12px;color:var(--text2);margin-bottom:8px">Reading files…</div>';
    const found = [];
    for await (const entry of dirHandle.values()){
      if(entry.kind !== 'file') continue;
      const n = entry.name.toLowerCase();
      if(!n.endsWith('.xlsx')&&!n.endsWith('.xls')&&!n.endsWith('.csv')) continue;
      if(n.startsWith('.')||n.startsWith('~')) continue;
      found.push({ entry, name:entry.name });
    }
    if(found.length===0){ grid.innerHTML='<div class="browser-note">No .xlsx/.xls/.csv files found.</div>'; return; }
    grid.innerHTML = '';
    const detected = {};
    const brokerColors = { zerodha:'#2458a0', icici:'#b43c0a', vested:'#0e7c6e' };
    for(const {entry, name} of found){
      const file = await entry.getFile();
      const ab   = await file.arrayBuffer();
      const broker = Parsers.detectBroker(ab, name);
      const row  = document.createElement('div');
      row.className = 'folder-file-row';
      if(!broker){
        row.classList.add('err');
        row.innerHTML = '<span class="frow-broker">Unknown</span><span class="frow-name">'+name+'</span><span class="frow-status err">⚠ Could not identify</span>';
        grid.appendChild(row); continue;
      }
      if(detected[broker]){
        row.classList.add('err');
        row.innerHTML = '<span class="frow-broker">'+broker.toUpperCase()+'</span><span class="frow-name">'+name+'</span><span class="frow-status err">⚠ Duplicate — skipped</span>';
        grid.appendChild(row); continue;
      }
      try {
        State.data[broker]  = broker==='icici' ? Parsers.icici(ab) : Parsers[broker](ab);
        State.files[broker] = name;
        detected[broker]    = true;
        row.classList.add('ok');
        row.innerHTML = '<span class="frow-broker" style="color:'+brokerColors[broker]+'">'+broker.toUpperCase()+'</span><span class="frow-name">'+name+'</span><span class="frow-status ok">✓ Loaded</span>';
      } catch(err){
        row.classList.add('err');
        row.innerHTML = '<span class="frow-broker">'+broker.toUpperCase()+'</span><span class="frow-name">'+name+'</span><span class="frow-status err">✗ '+err.message+'</span>';
      }
      grid.appendChild(row);
    }
    checkReadyState();
  } catch(err){
    if(err.name!=='AbortError') document.getElementById('folderStatus').innerHTML='<div class="browser-note">Error: '+err.message+'</div>';
  }
}

// ── MANUAL UPLOAD ──
function handleFile(broker, input){
  const file = input.files[0]; if(!file) return;
  const statusEl = document.getElementById('status-'+broker);
  const cardEl   = document.getElementById('card-'+broker);
  statusEl.className = 'file-status';
  statusEl.textContent = '⏳ Reading…';
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const ab = e.target.result;
      State.data[broker]  = broker==='icici' ? Parsers.icici(ab) : Parsers[broker](ab);
      State.files[broker] = file.name;
      statusEl.textContent = '✓ ' + file.name;
      cardEl.classList.add('loaded');
      checkReadyState();
    } catch(err){
      statusEl.className = 'file-status error';
      statusEl.textContent = '✗ ' + err.message;
    }
  };
  reader.readAsArrayBuffer(file);
}

['zerodha','icici','vested'].forEach(broker => {
  setTimeout(() => {
    const zone = document.getElementById('drop-'+broker); if(!zone) return;
    zone.addEventListener('dragover', e=>{ e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', ()=>zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e=>{
      e.preventDefault(); zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0]; if(!file) return;
      const input = document.getElementById('file-'+broker);
      const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
      handleFile(broker, input);
    });
  }, 100);
});

function checkReadyState(){
  document.getElementById('btnAnalyze').disabled = !(State.data.zerodha && State.data.icici && State.data.vested);
}

function resetApp(){
  ['zerodha','icici','vested'].forEach(b=>{
    State.data[b]=null; State.files[b]=null;
    const s=document.getElementById('status-'+b); if(s) s.textContent='';
    const c=document.getElementById('card-'+b);   if(c) c.classList.remove('loaded');
    const f=document.getElementById('file-'+b);   if(f) f.value='';
  });
  const fg = document.getElementById('folderStatus'); if(fg) fg.innerHTML='';
  Drive.token=null; ['zerodha','icici','vested'].forEach(b=>{ State.data[b]=null; State.files[b]=null; });
  sessionStorage.removeItem('pl_drive_token'); sessionStorage.removeItem('pl_drive_expiry');
  Object.values(State.charts).forEach(c=>{ try{c.destroy();}catch(e){} });
  State.charts={}; State.origRows={};
  document.getElementById('btnAnalyze').disabled=true;
  document.getElementById('uploadScreen').classList.add('active');
  document.getElementById('dashScreen').classList.remove('active');
  setMode('manual');
}

// ── FORMAT HELPERS ──
const fmtINR = (v) => {
  const abs=Math.abs(v), sign=v<0?'-':'';
  if(abs>=1e7) return sign+'₹'+(abs/1e7).toFixed(2)+'Cr';
  if(abs>=1e5) return sign+'₹'+(abs/1e5).toFixed(2)+'L';
  return sign+'₹'+Math.round(abs).toLocaleString('en-IN');
};
const fmtUSD = (v) => (v<0?'-':'')+'$'+Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtPct = (v) => (v>=0?'+':'')+v.toFixed(2)+'%';
const badge  = (ret) => '<span class="badge badge-'+(ret>=0?'gain':'loss')+'">'+fmtPct(ret)+'</span>';
const plCol  = (v) => v>=0 ? 'var(--gain)' : 'var(--loss)';
const plSign = (v) => v>=0 ? '+' : '-';

function segCard(label, value, sub, pos){
  return '<div class="seg-card">'+
    '<div class="seg-label">'+label+'</div>'+
    '<div class="seg-value">'+value+'</div>'+
    '<div class="seg-sub" style="color:'+(pos?'var(--gain)':'var(--loss)')+'">'+sub+'</div></div>';
}

// ── BUILD DASHBOARD ──
function buildDashboard(){
  State.usdInr = parseFloat(document.getElementById('usdInr').value)||84;
  const z=State.data.zerodha, ic=State.data.icici, vs=State.data.vested;

  const mfInv=z.summaryMF.invested||0, mfCur=z.summaryMF.current||0, mfPL=z.summaryMF.pl||0;
  const mfPct=z.summaryMF.plPct||(mfInv>0?mfPL/mfInv*100:0);

  const debtInv=z.debtRows.reduce((s,r)=>s+r.invested,0);
  const debtCur=z.debtRows.reduce((s,r)=>s+r.currentValue,0);
  const debtPL =z.debtRows.reduce((s,r)=>s+r.pl,0);
  const etfInv=(z.summaryEq.invested||0)-debtInv;
  const etfCur=(z.summaryEq.current ||0)-debtCur;
  const etfPL =(z.summaryEq.pl      ||0)-debtPL;

  const indInv=ic.summary.invested+etfInv, indCur=ic.summary.current+etfCur, indPL=ic.summary.pl+etfPL;
  const indPct=indInv>0?indPL/indInv*100:0;

  const usInvINR=vs.summary.invested*State.usdInr, usCurINR=vs.summary.current*State.usdInr;
  const usPLINR=vs.summary.pl*State.usdInr, usPct=vs.summary.plPct;

  const totInv=indInv+mfInv+usInvINR, totCur=indCur+mfCur+usCurINR;
  const totPL=indPL+mfPL+usPLINR, totPct=totInv>0?totPL/totInv*100:0;

  State.computed={ indInv,indCur,indPL,indPct, mfInv,mfCur,mfPL,mfPct,
                   usInvINR,usCurINR,usPLINR,usPct, totInv,totCur,totPL,totPct,
                   etfInv,etfCur,etfPL };

  document.getElementById('uploadScreen').classList.remove('active');
  document.getElementById('dashScreen').classList.add('active');
  const srcEl=document.getElementById('headerSource'); if(srcEl) srcEl.textContent = State.mode==='drive'?'Google Drive':State.mode==='folder'?'Local Folder':'Uploaded';
  document.getElementById('headerDate').textContent = 'As of '+
    new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});

  renderSummary(totInv,totCur,totPL,totPct);
  renderOverview();
  renderIndianStocks(ic.stocks, z.equityEtfs);
  renderIndianMFs(z.mutualFunds);
  renderUS(vs.holdings);
  renderMovers(ic.stocks, z.equityEtfs, vs.holdings, z.mutualFunds);
}

function renderSummary(inv,cur,pl,pct){
  document.getElementById('sumInvested').textContent = fmtINR(inv);
  document.getElementById('sumCurrent').textContent  = fmtINR(cur);
  const plEl=document.getElementById('sumPL');
  plEl.textContent=(pl>=0?'+':'')+fmtINR(pl); plEl.style.color=plCol(pl);
  const retEl=document.getElementById('sumReturn');
  retEl.textContent=fmtPct(pct); retEl.style.color=plCol(pct);
}

function renderOverview(){
  const c=State.computed, cc=getChartColors();
  document.getElementById('segGrid').innerHTML=
    segCard('Indian Stocks+ETFs',fmtINR(c.indCur),fmtPct(c.indPct),c.indPL>=0)+
    segCard('Indian MFs',fmtINR(c.mfCur),fmtPct(c.mfPct),c.mfPL>=0)+
    segCard('US Holdings (INR)',fmtINR(c.usCurINR),fmtPct(c.usPct),c.usPLINR>=0)+
    segCard('Total P&L',fmtINR(c.totPL),fmtPct(c.totPct),c.totPL>=0);

  const allocData=[c.indCur,c.mfCur,c.usCurINR];
  const allocLabels=['Indian Stocks+ETFs','Indian MFs','US Holdings'];
  const total=allocData.reduce((a,b)=>a+b,0);
  document.getElementById('allocLegend').innerHTML=allocLabels.map((l,i)=>
    '<span><span class="leg-sq" style="background:'+cc.alloc[i]+'"></span>'+l+' '+(total>0?(allocData[i]/total*100).toFixed(1):0)+'%</span>'
  ).join('');

  destroyChart('allocChart');
  State.charts.allocChart=new Chart(document.getElementById('allocChart'),{
    type:'doughnut',
    data:{ labels:allocLabels, datasets:[{ data:allocData, backgroundColor:cc.alloc, borderWidth:0 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'62%', plugins:{ legend:{ display:false } } }
  });

  destroyChart('perfChart');
  State.charts.perfChart=new Chart(document.getElementById('perfChart'),{
    type:'bar',
    data:{
      labels:['Indian Stocks+ETFs','Indian MFs','US (INR)'],
      datasets:[
        { label:'Invested', data:[c.indInv,c.mfInv,c.usInvINR], backgroundColor:cc.blue },
        { label:'Current',  data:[c.indCur,c.mfCur,c.usCurINR], backgroundColor:cc.gain }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ticks:{ color:cc.text, font:{size:11} }, grid:{ color:cc.grid } },
        y:{ ticks:{ color:cc.text, font:{size:11}, callback:v=>fmtINR(v) }, grid:{ color:cc.grid } }
      }
    }
  });
}

// ── INDIAN STOCKS — with sort reset ──
function renderIndianStocks(stocks, etfs){
  const c=State.computed;
  const etfPct=c.etfInv>0?c.etfPL/c.etfInv*100:0;
  document.getElementById('stockSegGrid').innerHTML=
    segCard('ICICI Stocks',fmtINR(State.data.icici.summary.current),fmtPct(State.data.icici.summary.plPct),State.data.icici.summary.pl>=0)+
    segCard('Zerodha ETFs',fmtINR(c.etfCur),fmtPct(etfPct),c.etfPL>=0)+
    segCard('Combined Invested',fmtINR(c.indInv),'',true)+
    segCard('Combined Return',fmtPct(c.indPct),'unrealized',c.indPL>=0);

  // Build rows: ICICI first, then Zerodha ETFs — preserving original order
  const allRows = [
    ...stocks.map(s=>({...s,isEtf:false})),
    ...etfs.map(e=>({symbol:e.symbol,name:e.symbol,qty:e.qty,avgPrice:e.avgPrice,cmp:e.cmp,
                     invested:e.invested,currentValue:e.currentValue,pl:e.pl,plPct:e.plPct,
                     source:'zerodha',isEtf:true}))
  ];

  const makeRow = (s) => {
    const pill=s.source==='icici'
      ? '<span class="source-pill pill-icici">ICICI</span>'
      : '<span class="source-pill pill-zerodha">ZRD ETF</span>';
    return '<tr class="'+(s.isEtf?'etf-row':'')+'" data-search="'+(s.name+' '+s.symbol).toLowerCase()+'">' +
      '<td>'+s.name+'</td>'+
      '<td style="font-family:var(--font-mono);font-size:12px">'+s.symbol+'</td>'+
      '<td class="num">'+s.qty.toLocaleString('en-IN')+'</td>'+
      '<td class="num">₹'+s.avgPrice.toFixed(2)+'</td>'+
      '<td class="num">₹'+s.cmp.toFixed(2)+'</td>'+
      '<td class="num">₹'+Math.round(s.currentValue).toLocaleString('en-IN')+'</td>'+
      '<td class="num" style="color:'+plCol(s.pl)+'">'+plSign(s.pl)+'₹'+Math.round(Math.abs(s.pl)).toLocaleString('en-IN')+'</td>'+
      '<td class="num">'+badge(s.plPct)+'</td>'+
      '<td class="num">'+pill+'</td></tr>';
  };

  const tbody = document.getElementById('stockBody');
  tbody.innerHTML = allRows.map(makeRow).join('');

  // Save original HTML for reset
  State.origRows['stockTable'] = tbody.innerHTML;
  State.origRows['stockData']  = allRows;
}

function renderIndianMFs(mfs){
  const c=State.computed;
  document.getElementById('mfSegGrid').innerHTML=
    segCard('Invested (statement)',fmtINR(c.mfInv),'',true)+
    segCard('Current Value',fmtINR(c.mfCur),'',true)+
    segCard('Total Gain',fmtINR(c.mfPL),'unrealized',c.mfPL>=0)+
    segCard('Overall Return',fmtPct(c.mfPct),'',c.mfPL>=0);

  document.getElementById('mfBody').innerHTML=mfs.map(m=>
    '<tr><td>'+m.name+'</td>'+
    '<td><span class="source-pill pill-zerodha">'+m.type+'</span></td>'+
    '<td class="num">'+m.units.toFixed(3)+'</td>'+
    '<td class="num">₹'+m.avgNAV.toFixed(4)+'</td>'+
    '<td class="num">₹'+m.currNAV.toFixed(4)+'</td>'+
    '<td class="num">₹'+Math.round(m.currentValue).toLocaleString('en-IN')+'</td>'+
    '<td class="num" style="color:var(--gain)">+₹'+Math.round(m.pl).toLocaleString('en-IN')+'</td>'+
    '<td class="num">'+badge(m.plPct)+'</td></tr>'
  ).join('');

  const sorted=[...mfs].sort((a,b)=>b.plPct-a.plPct);
  const sn=n=>n.replace('MOTILAL OSWAL ','MO ').replace(/ FUND - DIRECT PLAN$/,'').replace(/ INDEX FUND - DIRECT PLAN$/,'').replace(/ FUND OF FUND - DIRECT PLAN$/,' FOF');
  const cc=getChartColors();
  const h=Math.max(220,sorted.length*42);
  document.querySelector('#mfBarChart').parentElement.style.height=h+'px';
  destroyChart('mfBarChart');
  State.charts.mfBarChart=new Chart(document.getElementById('mfBarChart'),{
    type:'bar',
    data:{ labels:sorted.map(m=>sn(m.name)),
           datasets:[{ data:sorted.map(m=>parseFloat(m.plPct.toFixed(2))),
                       backgroundColor:sorted.map(m=>m.plPct>=50?cc.gain:m.plPct>=20?cc.blue:'#8890a8'),
                       borderWidth:0, borderRadius:4 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{ x:{ ticks:{ color:cc.text, callback:v=>v+'%' }, grid:{ color:cc.grid } },
               y:{ ticks:{ color:cc.text, font:{size:12} }, grid:{ display:false } } } }
  });
}

function renderUS(holdings){
  const vs=State.data.vested.summary;
  document.getElementById('usSegGrid').innerHTML=
    segCard('Invested (USD)',fmtUSD(vs.invested),'',true)+
    segCard('Current (USD)',fmtUSD(vs.current),'',true)+
    segCard('P&L (USD)',(vs.pl>=0?'+':'')+fmtUSD(vs.pl),'',vs.pl>=0)+
    segCard('Overall Return',fmtPct(vs.plPct),'USD basis',vs.pl>=0);

  const sorted=[...holdings].sort((a,b)=>b.plPct-a.plPct);
  const tbody=document.getElementById('usBody');
  tbody.innerHTML=sorted.map(h=>
    '<tr data-search="'+(h.name+' '+h.ticker).toLowerCase()+'">' +
    '<td>'+h.name+'</td>'+
    '<td style="font-family:var(--font-mono);font-size:12px">'+h.ticker+'</td>'+
    '<td class="num">'+h.shares.toFixed(3)+'</td>'+
    '<td class="num">$'+h.avgCost.toFixed(2)+'</td>'+
    '<td class="num">$'+h.cmp.toFixed(2)+'</td>'+
    '<td class="num">$'+h.currentValue.toFixed(2)+'</td>'+
    '<td class="num" style="color:'+plCol(h.pl)+'">'+plSign(h.pl)+'$'+Math.abs(h.pl).toFixed(2)+'</td>'+
    '<td class="num">'+badge(h.plPct)+'</td></tr>'
  ).join('');
  State.origRows['usTable']=tbody.innerHTML;
}

function renderMovers(stocks, etfs, usHoldings, mfs){
  const allInd=[
    ...stocks.map(s=>({name:s.name||s.symbol, ret:s.plPct})),
    ...etfs.map(e=>({name:e.symbol+' (ETF)', ret:e.plPct}))
  ];
  const sn=n=>n.replace('MOTILAL OSWAL ','MO ').replace(/ FUND - DIRECT PLAN$/,'').replace(/ INDEX FUND - DIRECT PLAN$/,'').replace(/ FUND OF FUND - DIRECT PLAN$/,' FOF');
  renderBars('indGainers',[...allInd].sort((a,b)=>b.ret-a.ret).slice(0,6).map(r=>[r.name,r.ret]),Math.max(...allInd.map(r=>Math.abs(r.ret))),'var(--gain)');
  renderBars('indLosers', [...allInd].sort((a,b)=>a.ret-b.ret).slice(0,6).map(r=>[r.name,r.ret]),Math.max(...allInd.map(r=>Math.abs(r.ret))),'var(--loss)');
  renderBars('usGainers', [...usHoldings].sort((a,b)=>b.plPct-a.plPct).slice(0,6).map(r=>[r.name||r.ticker,r.plPct]),Math.max(...usHoldings.map(r=>r.plPct)),'var(--gain)');
  renderBars('mfMovers',  [...mfs].sort((a,b)=>b.plPct-a.plPct).map(m=>[sn(m.name),m.plPct]),Math.max(...mfs.map(m=>m.plPct)),'var(--accent2)');
}

function renderBars(id, data, maxVal, color){
  document.getElementById(id).innerHTML=data.map(([name,val])=>{
    const pct=maxVal>0?Math.min(Math.abs(val)/maxVal*100,100).toFixed(1):0;
    return '<div class="bar-row">'+
      '<div class="bar-name" title="'+name+'">'+name+'</div>'+
      '<div class="bar-bg"><div class="bar-fill" style="width:'+pct+'%;background:'+color+'"></div></div>'+
      '<div class="bar-val" style="color:'+plCol(val)+'">'+fmtPct(val)+'</div></div>';
  }).join('');
}

// ── TABS ──
function switchTab(btn){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-'+btn.dataset.tab).classList.add('active');
}

// ── TABLE FILTER ──
function filterTable(id, q){
  document.getElementById(id).querySelectorAll('tbody tr').forEach(tr=>{
    tr.style.display=(tr.dataset.search||tr.textContent.toLowerCase()).includes(q.toLowerCase())?'':'none';
  });
}

// ── TABLE SORT with reset ──
const sortState={};
function sortTable(tableId, col){
  const table=document.getElementById(tableId);
  const tbody=table.querySelector('tbody');
  const rows=Array.from(tbody.querySelectorAll('tr'));
  const key=tableId+'_'+col, asc=!sortState[key]; sortState[key]=asc;

  rows.sort((a,b)=>{
    const av=(a.cells[col]?.textContent||'').trim().replace(/[₹$+%,]/g,'');
    const bv=(b.cells[col]?.textContent||'').trim().replace(/[₹$+%,]/g,'');
    const an=parseFloat(av), bn=parseFloat(bv);
    if(!isNaN(an)&&!isNaN(bn)) return asc?an-bn:bn-an;
    return asc?av.localeCompare(bv):bv.localeCompare(av);
  });
  rows.forEach(r=>tbody.appendChild(r));

  // Show reset button
  const resetId='reset-'+tableId;
  let resetBtn=document.getElementById(resetId);
  if(!resetBtn){
    resetBtn=document.createElement('button');
    resetBtn.id=resetId; resetBtn.className='btn-reset-sort visible';
    resetBtn.textContent='↺ Reset Order';
    resetBtn.onclick=()=>resetSort(tableId);
    // Insert after search/toolbar
    const toolbar=table.closest('.tab-panel')?.querySelector('.table-toolbar');
    if(toolbar) toolbar.appendChild(resetBtn);
  }
  resetBtn.classList.add('visible');
}

function resetSort(tableId){
  const tbody=document.getElementById(tableId).querySelector('tbody');
  if(State.origRows[tableId]) tbody.innerHTML=State.origRows[tableId];
  // Clear sort state for this table
  Object.keys(sortState).filter(k=>k.startsWith(tableId)).forEach(k=>delete sortState[k]);
  // Hide reset button
  const btn=document.getElementById('reset-'+tableId);
  if(btn) btn.classList.remove('visible');
}

function destroyChart(id){
  if(State.charts[id]){ try{State.charts[id].destroy();}catch(e){} delete State.charts[id]; }
}

// ── DEFAULT: start in Google Drive mode ──
window.addEventListener('DOMContentLoaded', () => {
  setMode('drive');
});
