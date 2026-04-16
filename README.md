# Portfolio Dashboard

A personal investment portfolio dashboard. Works entirely in your browser — no data is sent anywhere.

## Supported Brokers

| Broker | File Type | What it reads |
|--------|-----------|----------------|
| Zerodha | .xlsx | Equity (ETFs) + Mutual Funds sheets |
| ICICI Direct | .csv | Equity holdings export |
| Vested | .xlsx | Holdings sheet (US stocks & ETFs) |

## How to Deploy on GitHub Pages (One-time setup)

### Step 1 — Create a new GitHub repository
1. Go to https://github.com/new
2. Name it `portfolio-dashboard` (or any name you like)
3. Set visibility to **Private** (recommended — keeps your data private)
4. Click **Create repository**

### Step 2 — Upload these files
Upload all four files to the repository root:
- `index.html`
- `styles.css`
- `parsers.js`
- `dashboard.js`

You can drag-and-drop them directly on the GitHub web interface.

### Step 3 — Enable GitHub Pages
1. Go to your repository → **Settings** → **Pages**
2. Under **Source**, select **Deploy from a branch**
3. Choose branch: `main`, folder: `/ (root)`
4. Click **Save**

Your dashboard will be live at:
`https://YOUR-GITHUB-USERNAME.github.io/portfolio-dashboard/`

GitHub will show the URL in the Pages settings after ~2 minutes.

### Step 4 — Bookmark it
Save the URL on your phone and laptop. It works on all devices.

---

## How to Use (Every Time)

1. Open the URL on any device
2. Download fresh statements from Zerodha, ICICI, and Vested
3. Upload all three files to the dashboard
4. Set the current USD/INR rate
5. Click **Analyze Portfolio**

---

## How to Update the App (When formats change or you want new features)

1. Get the updated files from Claude (Nandhita)
2. Go to your GitHub repository
3. Click the file you want to replace → **Edit** (pencil icon) → paste new code → **Commit**
4. GitHub Pages auto-updates within ~1 minute

---

## Privacy Notes

- The app is **client-side only** — no server, no database, no tracking
- Your financial data never leaves your browser
- The GitHub repository stores only the app code, not your data
- Making the repository **Private** means only you can see the code
- If you want extra security, you can add GitHub Pages password protection via a third-party service like Cloudflare Access (free tier)

---

## File Format Resilience

The parsers use **flexible keyword matching** for column names, not exact matches. This means:
- Minor column renames by brokers are handled automatically
- New columns added by brokers are safely ignored
- If a major format change breaks parsing, share the new file with Nandhita — it'll be fixed in minutes

## Adding a New Broker in Future

Share the new broker's export file with Nandhita. A new parser module will be added to `parsers.js` and a new upload card to `index.html`. No other files need to change.
