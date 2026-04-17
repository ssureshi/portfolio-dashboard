/**
 * parsers.js — Modular broker parsers
 * Supports: Zerodha (.xlsx), ICICI (.xls or .csv), Vested (.xlsx)
 * Auto-detects which broker each file belongs to.
 */

window.Parsers = {};

/* ─────────────────────────────────────────────────────────────
   AUTO-DETECT broker from file contents or filename
───────────────────────────────────────────────────────────── */
Parsers.detectBroker = function(arrayBuffer, filename) {
  const fname = (filename || '').toLowerCase();
  if (fname.includes('zerodha'))  return 'zerodha';
  if (fname.includes('icici'))    return 'icici';
  if (fname.includes('vested'))   return 'vested';

  try {
    const text = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer).slice(0, 3000));
    if (text.includes('Equity Holdings Statement') || text.includes('Mutual Funds Holdings')) return 'zerodha';
    if (text.includes('Stock Symbol') || text.includes('Value At Cost')) return 'icici';
    if (text.includes('Total Shares Held') || text.includes('Investment Returns')) return 'vested';
  } catch(e) {}

  try {
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const sheets = wb.SheetNames.map(s => s.toLowerCase());
    if (sheets.includes('equity') && sheets.some(s => s.includes('mutual'))) return 'zerodha';
    if (sheets.some(s => s.includes('holding'))) {
      const ws = wb.Sheets[wb.SheetNames.find(n => n.toLowerCase().includes('holding'))];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const flat = data.slice(0,3).map(r => r.join(' ')).join(' ').toLowerCase();
      if (flat.includes('ticker') || flat.includes('investment returns')) return 'vested';
      if (flat.includes('stock symbol') || flat.includes('value at cost')) return 'icici';
    }
    if (sheets.length <= 2) {
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const flat = data.slice(0,3).map(r => r.join(' ')).join(' ').toLowerCase();
      if (flat.includes('stock symbol') || flat.includes('value at cost')) return 'icici';
    }
  } catch(e) {}

  return null;
};

/* ─────────────────────────────────────────────────────────────
   ZERODHA — Equity (ETFs) + Mutual Funds sheets
───────────────────────────────────────────────────────────── */
Parsers.zerodha = function(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const findSheet = (kws) => {
    const name = wb.SheetNames.find(n => kws.some(k => n.toLowerCase().includes(k)));
    return name ? XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) : [];
  };

  const parseEqSummary = (raw) => {
    const s = {};
    raw.forEach(row => {
      for (let ci = 0; ci < row.length - 1; ci++) {
        const label = String(row[ci] || '').toLowerCase().trim();
        const val   = parseFloat(row[ci + 1]);
        if (isNaN(val)) continue;
        if (label.includes('invested value'))                                 s.invested = val;
        else if (label.includes('present value'))                             s.current  = val;
        else if (label.includes('unrealized p&l') && !label.includes('pct')) s.pl       = val;
      }
    });
    return s;
  };

  const eqRaw = findSheet(['equity']);
  const summaryEq = parseEqSummary(eqRaw);
  const eqHeaderIdx = eqRaw.findIndex(r => r.some(c => String(c).trim() === 'Symbol'));
  const eqHdr = eqRaw[eqHeaderIdx] || [];
  const ci = (kw) => eqHdr.findIndex(h => String(h).toLowerCase().includes(kw.toLowerCase()));
  const iSym=ci('symbol'), iSec=ci('sector'), iQty=ci('quantity available'),
        iQtyLT=ci('quantity long'), iAvg=ci('average price'), iClose=ci('previous closing'),
        iPL=ci('unrealized p&l');
  const iPLPct = eqHdr.findIndex((h,i) => String(h).toLowerCase().includes('unrealized p&l') && i > iPL);

  const equityEtfs=[], debtRows=[];
  for (let i = eqHeaderIdx+1; i < eqRaw.length; i++) {
    const row = eqRaw[i];
    const sym = String(row[iSym]||'').trim(); if (!sym) continue;
    const sector = String(row[iSec]||'').toUpperCase();
    const qty  = (parseFloat(row[iQty])||0) + (parseFloat(row[iQtyLT])||0);
    const avg  = parseFloat(row[iAvg])||0, close=parseFloat(row[iClose])||0;
    const pl   = parseFloat(row[iPL])||0, plPct=parseFloat(row[iPLPct])||0;
    const item = { symbol:sym, sector, qty, avgPrice:avg, cmp:close,
                   invested:qty*avg, currentValue:qty*close, pl, plPct, source:'zerodha' };
    if (sector==='DEBT') debtRows.push(item);
    else if (sector==='ETF') equityEtfs.push(item);
  }

  const mfRaw = findSheet(['mutual']);
  const summaryMF = {};
  mfRaw.forEach(row => {
    for (let ci = 0; ci < row.length-1; ci++) {
      const label = String(row[ci]||'').toLowerCase().trim();
      const val   = parseFloat(row[ci+1]);
      if (isNaN(val)) continue;
      if (label.includes('invested value'))                                 summaryMF.invested = val;
      else if (label.includes('present value'))                             summaryMF.current  = val;
      else if (label.includes('unrealized p&l') && !label.includes('pct')) summaryMF.pl       = val;
      else if (label.includes('pct'))                                       summaryMF.plPct    = val;
    }
  });

  const mfHeaderIdx = mfRaw.findIndex(r => r.some(c => String(c).trim() === 'Symbol'));
  const mfHdr = mfRaw[mfHeaderIdx] || [];
  const mi = (kw) => mfHdr.findIndex(h => String(h).toLowerCase().includes(kw.toLowerCase()));
  const mSym=mi('symbol'), mType=mi('instrument type'), mQty=mi('quantity available'),
        mAvg=mi('average price'), mNav=mi('previous closing'), mPL=mi('unrealized p&l');
  const mPLPct = mfHdr.findIndex((h,i) => String(h).toLowerCase().includes('unrealized p&l') && i > mPL);

  const mutualFunds=[];
  for (let i = mfHeaderIdx+1; i < mfRaw.length; i++) {
    const row=mfRaw[i], name=String(row[mSym]||'').trim(); if (!name) continue;
    const units=parseFloat(row[mQty])||0, avg=parseFloat(row[mAvg])||0, nav=parseFloat(row[mNav])||0;
    const pl=parseFloat(row[mPL])||0, plPct=parseFloat(row[mPLPct])||0;
    let t=String(row[mType]||'').replace(/[{}]/g,'').split('-')[0].trim();
    if (t.toLowerCase().includes('fund of fund')) t='FOF';
    else if (t.toLowerCase().includes('index'))   t='Index';
    else if (t.toLowerCase().includes('flexi'))   t='Flexi Cap';
    else if (t.toLowerCase().includes('equity'))  t='Equity';
    else t=t.substring(0,12);
    mutualFunds.push({ name, type:t, units, avgNAV:avg, currNAV:nav,
                       invested:units*avg, currentValue:units*nav, pl, plPct, source:'zerodha' });
  }
  return { equityEtfs, mutualFunds, debtRows, summaryEq, summaryMF };
};

/* ─────────────────────────────────────────────────────────────
   ICICI — handles .xls (true/HTML-disguised) and .csv
───────────────────────────────────────────────────────────── */
Parsers.icici = function(arrayBuffer) {
  let rows = [];

  // Strategy 1: SheetJS (handles true XLS + XLSX)
  try {
    const wb   = XLSX.read(arrayBuffer, { type:'array', raw:false });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
    const hIdx = data.findIndex(r =>
      r.some(c => String(c).toLowerCase().includes('stock symbol') ||
                  String(c).toLowerCase().includes('company name'))
    );
    if (hIdx >= 0) rows = data.slice(hIdx);
  } catch(e) {}

  // Strategy 2: plain CSV text
  if (rows.length === 0) {
    try {
      const text  = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer));
      const lines = text.split('\n').filter(l => l.trim());
      const hIdx  = lines.findIndex(l =>
        l.toLowerCase().includes('stock symbol') || l.toLowerCase().includes('company name')
      );
      if (hIdx >= 0) {
        rows = lines.slice(hIdx).map(line => {
          const result=[]; let cur=''; let inQ=false;
          for (let ch of line) {
            if (ch==='"') inQ=!inQ;
            else if (ch===',' && !inQ) { result.push(cur.trim()); cur=''; }
            else cur+=ch;
          }
          result.push(cur.trim()); return result;
        });
      }
    } catch(e) {}
  }

  // Strategy 3: HTML-disguised XLS
  if (rows.length === 0) {
    try {
      const text = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer));
      if (text.includes('<table') || text.includes('<TABLE') || text.includes('<TR')) {
        const doc   = new DOMParser().parseFromString(text, 'text/html');
        const trows = Array.from(doc.querySelectorAll('tr'));
        rows = trows.map(tr =>
          Array.from(tr.querySelectorAll('td,th')).map(td => td.textContent.trim())
        ).filter(r => r.some(c => c.trim()));
        const hIdx = rows.findIndex(r =>
          r.some(c => c.toLowerCase().includes('stock symbol') || c.toLowerCase().includes('company name'))
        );
        if (hIdx >= 0) rows = rows.slice(hIdx);
        else rows = [];
      }
    } catch(e) {}
  }

  if (rows.length < 2) throw new Error('ICICI file could not be parsed. Please check the format.');

  const headers = rows[0].map(h => String(h).toLowerCase().trim());
  const col = (...kws) => {
    for (let kw of kws) { const i=headers.findIndex(h=>h.includes(kw)); if (i>=0) return i; }
    return -1;
  };
  const iSym=col('stock symbol','symbol'), iName=col('company name','name');
  const iQty=col('qty','quantity'), iAvg=col('average cost price','average cost','avg cost','average price');
  const iCMP=col('current market price','market price','cmp');
  const iCost=col('value at cost','cost value'), iMkt=col('value at market','market value','current value');
  const iPL=col('unrealized profit/loss','unrealized p&l'), iPLPct=col('unrealized profit/loss %','profit/loss %');

  const clean = (v) => parseFloat(String(v||'').replace(/[₹,\s]/g,'').replace(/\(([^)]+)\)/,'$1').replace(/^\(/,'-')) || 0;

  const stocks=[];
  for (let i=1; i<rows.length; i++) {
    const row=rows[i], name=String(row[iName]||'').trim();
    if (!name || name.toLowerCase()==='company name') continue;
    const qty=clean(row[iQty]), avg=clean(row[iAvg]), cmp=clean(row[iCMP]);
    const cost=clean(row[iCost]), mkt=clean(row[iMkt]);
    const pl=clean(row[iPL]); let plPct=clean(row[iPLPct]);
    if (!plPct && cost>0) plPct=pl/cost*100;
    if (qty===0 && cost===0) continue;
    stocks.push({ symbol:String(row[iSym]||'').trim(), name, qty, avgPrice:avg, cmp,
                  invested:cost||qty*avg, currentValue:mkt||qty*cmp, pl, plPct, source:'icici' });
  }
  const invested=stocks.reduce((s,r)=>s+r.invested,0), current=stocks.reduce((s,r)=>s+r.currentValue,0);
  const pl=stocks.reduce((s,r)=>s+r.pl,0);
  return { stocks, summary:{ invested, current, pl, plPct:invested>0?pl/invested*100:0 } };
};

/* ─────────────────────────────────────────────────────────────
   VESTED — Holdings sheet
───────────────────────────────────────────────────────────── */
Parsers.vested = function(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type:'array' });
  const sheetName = wb.SheetNames.find(n=>n.toLowerCase().includes('holding')) || wb.SheetNames[0];
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header:1, defval:'' });
  const hIdx = raw.findIndex(r=>r.some(c=>String(c).toLowerCase().includes('ticker')||String(c).toLowerCase().includes('symbol')));
  if (hIdx<0) throw new Error('Could not find header in Vested file.');
  const headers=raw[hIdx].map(h=>String(h).toLowerCase().trim());
  const col=(...kws)=>{ for(let kw of kws){const i=headers.findIndex(h=>h.includes(kw));if(i>=0)return i;} return -1; };
  const iName=col('name'), iTicker=col('ticker','symbol'), iShares=col('total shares','shares held','shares');
  const iCMP=col('current price'), iCurVal=col('current value'), iAvg=col('average cost');
  const iInvest=col('total amount invested','amount invested','invested');
  const iReturn=col('investment returns (usd)','returns (usd)','returns usd');
  const iRetPct=col('investment returns (%)','returns (%)','return %');

  const holdings=[];
  for (let i=hIdx+1; i<raw.length; i++) {
    const row=raw[i], ticker=String(row[iTicker]||'').trim(); if(!ticker) continue;
    const invested=parseFloat(row[iInvest])||0, current=parseFloat(row[iCurVal])||0;
    const pl=parseFloat(row[iReturn])||(current-invested);
    const plPct=parseFloat(row[iRetPct])||(invested>0?pl/invested*100:0);
    holdings.push({ name:String(row[iName]||ticker).trim(), ticker,
                    shares:parseFloat(row[iShares])||0, avgCost:parseFloat(row[iAvg])||0,
                    cmp:parseFloat(row[iCMP])||0, invested, currentValue:current, pl, plPct, source:'vested' });
  }
  const invested=holdings.reduce((s,r)=>s+r.invested,0), current=holdings.reduce((s,r)=>s+r.currentValue,0);
  const pl=holdings.reduce((s,r)=>s+r.pl,0);
  return { holdings, summary:{ invested, current, pl, plPct:invested>0?pl/invested*100:0 } };
};
