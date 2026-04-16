/**
 * parsers.js — Modular broker parsers
 * Each parser returns a standardised object.
 * Adding a new broker = adding a new parse function here only.
 */

window.Parsers = {};

/* ─────────────────────────────────────────
   ZERODHA — reads Equity + Mutual Funds sheets
   Returns: { equityEtfs[], mutualFunds[], summaryEq{}, summaryMF{} }
───────────────────────────────────────── */
Parsers.zerodha = function(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });

  // ── Equity sheet ──
  const eqSheet = wb.Sheets['Equity'] || wb.Sheets[wb.SheetNames.find(n => n.toLowerCase().includes('equity'))];
  const eqRaw   = XLSX.utils.sheet_to_json(eqSheet, { header: 1, defval: '' });

  // Pull summary from fixed rows (rows 14-17 in 0-indexed = rows 15-18 in sheet)
  const summaryEq = {};
  eqRaw.forEach(row => {
    const r = row.map(String);
    if (r[1] && r[1].toLowerCase().includes('invested'))      summaryEq.invested = parseFloat(r[2]) || 0;
    if (r[1] && r[1].toLowerCase().includes('present'))       summaryEq.current  = parseFloat(r[2]) || 0;
    if (r[1] && r[1].toLowerCase().includes('unrealized p&l') && !r[1].toLowerCase().includes('pct')) summaryEq.pl = parseFloat(r[2]) || 0;
  });

  // Find header row (contains 'Symbol')
  let eqHeaderIdx = eqRaw.findIndex(r => r.some(c => String(c).trim() === 'Symbol'));
  const eqHeaders = eqRaw[eqHeaderIdx] || [];

  const colIdx = (keyword) => eqHeaders.findIndex(h => String(h).toLowerCase().includes(keyword.toLowerCase()));
  const iSym   = colIdx('symbol');
  const iSec   = colIdx('sector');
  const iQty   = colIdx('quantity available');
  const iQtyLT = colIdx('quantity long');
  const iAvg   = colIdx('average price');
  const iClose = colIdx('previous closing');
  const iPL    = colIdx('unrealized p&l');
  const iPLPct = eqHeaders.findIndex((h,i) => String(h).toLowerCase().includes('unrealized p&l') && i > iPL);

  const equityEtfs = [];
  const debtRows   = [];

  for (let i = eqHeaderIdx + 1; i < eqRaw.length; i++) {
    const row = eqRaw[i];
    if (!row[iSym] || String(row[iSym]).trim() === '') continue;
    const sector = String(row[iSec] || '').toUpperCase();
    const qty    = parseFloat(row[iQty])   || 0;
    const qtyLT  = parseFloat(row[iQtyLT]) || 0;
    const totalQty = qty + qtyLT;
    const avg    = parseFloat(row[iAvg])   || 0;
    const close  = parseFloat(row[iClose]) || 0;
    const pl     = parseFloat(row[iPL])    || 0;
    const plPct  = parseFloat(row[iPLPct]) || 0;

    const item = {
      symbol: String(row[iSym]).trim(),
      sector,
      qty: totalQty,
      avgPrice: avg,
      cmp: close,
      invested: totalQty * avg,
      currentValue: totalQty * close,
      pl, plPct,
      source: 'zerodha'
    };

    if (sector === 'DEBT') debtRows.push(item);
    else if (sector === 'ETF') equityEtfs.push(item);
  }

  // ── MF sheet ──
  const mfSheet = wb.Sheets['Mutual Funds'] || wb.Sheets[wb.SheetNames.find(n => n.toLowerCase().includes('mutual'))];
  const mfRaw   = XLSX.utils.sheet_to_json(mfSheet, { header: 1, defval: '' });

  // Summary from sheet
  const summaryMF = {};
  mfRaw.forEach(row => {
    const r = row.map(String);
    if (r[1] && r[1].toLowerCase().includes('invested'))      summaryMF.invested = parseFloat(r[2]) || 0;
    if (r[1] && r[1].toLowerCase().includes('present'))       summaryMF.current  = parseFloat(r[2]) || 0;
    if (r[1] && r[1].toLowerCase().includes('unrealized p&l') && !r[1].toLowerCase().includes('pct')) summaryMF.pl = parseFloat(r[2]) || 0;
    if (r[1] && r[1].toLowerCase().includes('pct'))           summaryMF.plPct    = parseFloat(r[2]) || 0;
  });

  let mfHeaderIdx = mfRaw.findIndex(r => r.some(c => String(c).trim() === 'Symbol'));
  const mfHeaders = mfRaw[mfHeaderIdx] || [];

  const mfColIdx  = (kw) => mfHeaders.findIndex(h => String(h).toLowerCase().includes(kw.toLowerCase()));
  const mSym  = mfColIdx('symbol');
  const mType = mfColIdx('instrument type');
  const mQty  = mfColIdx('quantity available');
  const mAvg  = mfColIdx('average price');
  const mNav  = mfColIdx('previous closing');
  const mPL   = mfColIdx('unrealized p&l');
  const mPLPct = mfHeaders.findIndex((h,i) => String(h).toLowerCase().includes('unrealized p&l') && i > mPL);

  const mutualFunds = [];
  for (let i = mfHeaderIdx + 1; i < mfRaw.length; i++) {
    const row = mfRaw[i];
    if (!row[mSym] || String(row[mSym]).trim() === '') continue;
    const units = parseFloat(row[mQty]) || 0;
    const avg   = parseFloat(row[mAvg]) || 0;
    const nav   = parseFloat(row[mNav]) || 0;
    const pl    = parseFloat(row[mPL])  || 0;
    const plPct = parseFloat(row[mPLPct]) || 0;

    // Parse type from curly-brace format
    let typeRaw = String(row[mType] || '');
    let type = typeRaw.replace(/[{}]/g,'').split('-')[0].trim();
    if (type.toLowerCase().includes('fund of fund')) type = 'FOF';
    else if (type.toLowerCase().includes('index'))   type = 'Index';
    else if (type.toLowerCase().includes('flexi'))   type = 'Flexi Cap';
    else if (type.toLowerCase().includes('equity'))  type = 'Equity';
    else type = type.substring(0,12);

    mutualFunds.push({
      name: String(row[mSym]).trim(),
      type,
      units,
      avgNAV: avg,
      currNAV: nav,
      invested: units * avg,
      currentValue: units * nav,
      pl, plPct,
      source: 'zerodha'
    });
  }

  return { equityEtfs, mutualFunds, summaryEq, summaryMF, debtRows };
};

/* ─────────────────────────────────────────
   ICICI — reads CSV, flexible column matching
   Returns: { stocks[] }
───────────────────────────────────────── */
Parsers.icici = function(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('ICICI CSV appears empty');

  // Find header row (contains "stock symbol" or "company name")
  let headerIdx = lines.findIndex(l => l.toLowerCase().includes('stock symbol') || l.toLowerCase().includes('company name'));
  if (headerIdx < 0) headerIdx = 0;

  const parseCSVLine = (line) => {
    const result = []; let cur = ''; let inQ = false;
    for (let ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    result.push(cur.trim()); return result;
  };

  const headers = parseCSVLine(lines[headerIdx]).map(h => h.toLowerCase().trim());

  const col = (keywords) => {
    for (let kw of keywords) {
      const idx = headers.findIndex(h => h.includes(kw));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const iSym  = col(['stock symbol','symbol']);
  const iName = col(['company name','name']);
  const iQty  = col(['qty','quantity']);
  const iAvg  = col(['average cost','avg cost','average price']);
  const iCMP  = col(['current market price','market price','cmp']);
  const iCost = col(['value at cost','cost value','invested']);
  const iMkt  = col(['value at market','market value','current value']);
  const iPL   = col(['unrealized profit/loss','unrealized p','profit/loss','p&l']);
  const iPLPct= col(['unrealized profit/loss %','profit/loss %','p&l %','%']);

  const stocks = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (!row[iName] || row[iName].trim() === '') continue;
    const qty  = parseFloat(String(row[iQty]).replace(/,/g,''))  || 0;
    const avg  = parseFloat(String(row[iAvg]).replace(/,/g,''))  || 0;
    const cmp  = parseFloat(String(row[iCMP]).replace(/,/g,''))  || 0;
    const cost = parseFloat(String(row[iCost]).replace(/,/g,'')) || 0;
    const mkt  = parseFloat(String(row[iMkt]).replace(/,/g,''))  || 0;
    const pl   = parseFloat(String(row[iPL]).replace(/[(),]/g,'').replace('(','-')) || 0;
    let plPct  = parseFloat(String(row[iPLPct]).replace(/[(),]/g,'').replace('(','-')) || 0;
    if (isNaN(plPct) || plPct === 0) plPct = cost > 0 ? (pl / cost * 100) : 0;

    stocks.push({
      symbol: String(row[iSym] || '').trim(),
      name: String(row[iName]).trim(),
      qty, avgPrice: avg, cmp,
      invested: cost || qty * avg,
      currentValue: mkt || qty * cmp,
      pl, plPct, source: 'icici'
    });
  }

  // Summary from data
  const invested = stocks.reduce((s,r) => s + r.invested, 0);
  const current  = stocks.reduce((s,r) => s + r.currentValue, 0);
  const totalPL  = stocks.reduce((s,r) => s + r.pl, 0);
  return { stocks, summary: { invested, current, pl: totalPL, plPct: invested > 0 ? totalPL/invested*100 : 0 } };
};

/* ─────────────────────────────────────────
   VESTED — reads Holdings sheet from XLSX
   Returns: { holdings[], summary{} }
───────────────────────────────────────── */
Parsers.vested = function(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('holding')) || wb.SheetNames[0];
  const ws  = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Find header row
  let hIdx = raw.findIndex(r => r.some(c => String(c).toLowerCase().includes('ticker') || String(c).toLowerCase().includes('symbol')));
  if (hIdx < 0) hIdx = 0;
  const headers = raw[hIdx].map(h => String(h).toLowerCase().trim());

  const col = (kws) => { for (let kw of kws) { const i = headers.findIndex(h => h.includes(kw)); if (i>=0) return i; } return -1; };
  const iName    = col(['name']);
  const iTicker  = col(['ticker','symbol']);
  const iShares  = col(['total shares','shares held','shares']);
  const iCMP     = col(['current price']);
  const iCurVal  = col(['current value']);
  const iAvgCost = col(['average cost']);
  const iInvest  = col(['total amount invested','amount invested','invested']);
  const iReturn  = col(['investment returns (usd)','returns (usd)','returns usd']);
  const iRetPct  = col(['investment returns (%)','returns (%)','return %']);

  const holdings = [];
  for (let i = hIdx + 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row[iTicker] || String(row[iTicker]).trim() === '') continue;
    const invested = parseFloat(row[iInvest]) || 0;
    const current  = parseFloat(row[iCurVal]) || 0;
    const pl       = parseFloat(row[iReturn]) || (current - invested);
    const plPct    = parseFloat(row[iRetPct]) || (invested > 0 ? pl/invested*100 : 0);

    holdings.push({
      name: String(row[iName]).trim(),
      ticker: String(row[iTicker]).trim(),
      shares: parseFloat(row[iShares]) || 0,
      avgCost: parseFloat(row[iAvgCost]) || 0,
      cmp: parseFloat(row[iCMP]) || 0,
      invested, currentValue: current,
      pl, plPct, source: 'vested'
    });
  }

  const summary = {
    invested: holdings.reduce((s,r) => s + r.invested, 0),
    current:  holdings.reduce((s,r) => s + r.currentValue, 0),
    pl:       holdings.reduce((s,r) => s + r.pl, 0),
  };
  summary.plPct = summary.invested > 0 ? summary.pl / summary.invested * 100 : 0;

  return { holdings, summary };
};
