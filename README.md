# PortfolioLens — Personal Investment Dashboard

A private, browser-based portfolio dashboard for tracking Indian and US market investments.
All processing happens **locally in your browser** — no data is ever sent to any server.

---

## Supported Brokers & File Formats

| Broker | File Format | What it reads |
|--------|-------------|----------------|
| Zerodha | `.xlsx` | Equity sheet (ETFs) + Mutual Funds sheet |
| ICICI Direct | `.xls` or `.csv` | Equity holdings export |
| Vested | `.xlsx` | Holdings sheet (US stocks & ETFs) |

> **Note:** ICICI supports both `.xls` and `.csv` exports. Use `.xls` for consistency with other files.
> Debt/Bond instruments in Zerodha are automatically excluded from the dashboard.

---

## Features

- **Overview** — Total invested vs current value, allocation donut chart, segment bar chart
- **Indian Stocks** — All ICICI stocks + Zerodha ETFs, sortable and searchable
- **Indian MFs** — All Zerodha mutual funds with NAV-based returns and bar chart
- **US Holdings** — All Vested positions in USD, sorted by return
- **Top Movers** — Visual bar charts of top gainers and underperformers across all segments
- **Three upload modes** — Google Drive, local folder selection, or manual file upload
- **Auto-detection** — App identifies which broker each file belongs to automatically
- **Flexible parsing** — Column name changes by brokers are handled gracefully
- **Light / Dark theme** — Toggle in the header; preference saved across sessions

---

## How to Use

### Mode 1 — Google Drive (recommended for regular use)

Files are read directly from a folder named `Portfolio_Dashboard` in your Google Drive root.

1. Create a folder called `Portfolio_Dashboard` in **My Drive** (not inside any subfolder)
2. Upload your 3 fresh broker statement files into that folder
3. Open your dashboard URL and click **⊙ Google Drive**
4. Sign in with Google when prompted (read-only access, no writes)
5. App auto-detects and loads all 3 files, then builds the dashboard automatically
6. Set USD/INR rate if needed and click **Analyze Portfolio**

> **Token caching:** Once signed in, the session token is cached for 55 minutes — no repeated sign-ins needed in the same browser session.

### Mode 2 — Local Folder (Chrome & Edge on laptop/desktop only)

Best when you don't want to use Google Drive.

1. Save all 3 fresh statement files into one local folder
   (e.g. `Downloads/Portfolio_Dashboard/`)
2. Open your dashboard URL in Chrome or Edge
3. Click the **◫ Local Folder** tab
4. Click the folder zone and choose your folder
5. App auto-detects and loads all 3 files
6. Set USD/INR rate and click **Analyze Portfolio**

### Mode 3 — Upload Files (works on all browsers, all devices)

1. Open your dashboard URL
2. Click the **↑ Upload Files** tab
3. Upload each of the 3 broker files individually
4. Set the current USD/INR exchange rate
5. Click **Analyze Portfolio**

> **Tip:** Name your files consistently so auto-detection works reliably:
> - `Zerodha_Holdings_DD-Mon-YYYY.xlsx`
> - `ICICI_Holdings_DD-Mon-YYYY.xls`
> - `Vested_Holdings_DD-Mon-YYYY.xlsx`

---

## How to Deploy on GitHub Pages (One-time setup)

### Step 1 — Create a GitHub repository
1. Go to https://github.com/new
2. Name it `portfolio-dashboard`
3. Visibility: **Public** (required for free GitHub Pages)
4. Click **Create repository**

### Step 2 — Upload all 6 files
Drag and drop onto the GitHub upload page:
- `index.html`
- `styles.css`
- `parsers.js`
- `dashboard.js`
- `drive.js`
- `README.md`

### Step 3 — Enable GitHub Pages
1. Repository → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` | Folder: `/ (root)` | Click **Save**
4. Wait 2 minutes — your URL appears:
   `https://YOUR-USERNAME.github.io/portfolio-dashboard/`

### Step 4 — Bookmark the URL on all your devices

---

## How to Update the App

When Nandhita provides updated files (new features or format fixes):

1. Go to your GitHub repository
2. Click the file → pencil (edit) icon → paste new code → **Commit changes**
3. GitHub Pages auto-updates within ~1 minute

---

## Feature Status

| Phase | Feature | Status |
|-------|---------|--------|
| Phase 1 | Manual file upload | Done |
| Phase 1 | Local folder selection (Chrome/Edge) | Done |
| Phase 1 | ICICI `.xls` support | Done |
| Phase 1 | Auto broker detection | Done |
| Phase 1 | Light / Dark theme toggle | Done |
| Phase 2 | Google Drive integration | Done |
| Phase 3 | VS Code + GitHub + Claude Code workflow | Future |

---

## Privacy & Security

- 100% client-side — no server, no database, no analytics, no tracking
- Financial data is processed in browser memory only — never stored or transmitted
- GitHub repository contains only app code — never your financial data
- Data disappears when you close the browser tab (by design)
- Folder access (Mode 2) is read-only — the app cannot modify your files
- Google Drive access (Mode 1) is read-only (`drive.readonly` scope) — app cannot write to Drive
- Google OAuth token is cached in `sessionStorage` only — cleared when the tab is closed

---

## File Format Resilience

Parsers use flexible keyword matching rather than exact column names:
- Minor column renames by brokers are handled automatically
- Extra columns added by brokers are safely ignored
- Three fallback strategies for ICICI files: true XLS, CSV text, HTML-disguised XLS
- If a major format change breaks parsing, share the new file — fixed in minutes

---

## Adding a New Broker in Future

1. Share the new broker's export file with Nandhita
2. New parser function added to `parsers.js`
3. New upload card added to `index.html`
4. Auto-detection logic updated in `parsers.js`
5. No other files change — fully modular design

---

## Project Structure

```
portfolio-dashboard/
├── index.html      — App shell, upload UI, dashboard layout
├── styles.css      — All styling (light + dark themes)
├── parsers.js      — Broker file parsers + auto-detection logic
├── dashboard.js    — App logic, rendering, charts, theme, mode switching
├── drive.js        — Google Drive OAuth + file loading integration
└── README.md       — This file
```

---

Built with: SheetJS (file parsing), Chart.js (charts), Google Fonts (typography), Google Identity Services (OAuth)
Maintained by: Nandhita (Claude) for Suresh Anna
