/**
 * drive.js — Google Drive integration for PortfolioLens
 * Reads files from My Drive → Portfolio_Dashboard folder automatically.
 * Uses Google Identity Services (OAuth 2.0) — no backend required.
 */

const Drive = {
  CLIENT_ID:    '314790197301-ispc4ql5bbismbfb6ln5qa2g21rt7352.apps.googleusercontent.com',
  SCOPE:        'https://www.googleapis.com/auth/drive.readonly',
  FOLDER_NAME:  'Portfolio_Dashboard',
  FOLDER_PATH:  'My Drive → Portfolio_Dashboard',
  API_BASE:     'https://www.googleapis.com/drive/v3',
  token:        null,
  tokenClient:  null,
  autoTriggered: false,
};

/* ── UI helpers ── */
function driveUI(text, sub, showConnect, showRefresh, fileRows){
  document.getElementById('driveStatusText').textContent    = text;
  document.getElementById('driveStatusSub').textContent     = sub || '';
  document.getElementById('btnDriveConnect').style.display  = showConnect  ? 'inline-flex' : 'none';
  document.getElementById('btnDriveRefresh').style.display  = showRefresh  ? 'inline-flex' : 'none';
  const fl = document.getElementById('driveFileList');
  fl.innerHTML = fileRows || '';
}

function driveFileRow(name, status, ok){
  const cls = ok ? 'ok' : 'err';
  const ic  = ok ? '✓' : '✗';
  return '<div class="folder-file-row ' + cls + '">' +
    '<div class="frow-name">'+name+'</div>' +
    '<div class="frow-status '+cls+'">'+ic+' '+status+'</div></div>';
}

/* ── Initialise — called when Drive mode is activated ── */
function driveInit(){
  // Wait for GIS library to load (it loads async)
  const tryInit = (attempts) => {
    if(typeof google === 'undefined' || !google.accounts){
      if(attempts > 20){ driveUI('Google library failed to load.', 'Check your internet connection.', false, false); return; }
      setTimeout(() => tryInit(attempts + 1), 300);
      return;
    }
    Drive.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: Drive.CLIENT_ID,
      scope:     Drive.SCOPE,
      callback:  (resp) => {
        if(resp.error){ driveUI('Sign-in cancelled.', 'Click "Sign in" to try again.', true, false); return; }
        Drive.token = resp.access_token;
        driveLoadFiles();
      }
    });

    // Check if we have a cached token in sessionStorage
    const cached = sessionStorage.getItem('pl_drive_token');
    const expiry  = sessionStorage.getItem('pl_drive_expiry');
    if(cached && expiry && Date.now() < parseInt(expiry)){
      Drive.token = cached;
      driveLoadFiles();
    } else {
      // Auto-trigger sign-in silently (prompt:none = no popup if already authorised)
      driveUI('Connecting to Google Drive…', 'Checking existing authorisation…', false, false);
      Drive.tokenClient.requestAccessToken({ prompt: '' });
    }
  };
  tryInit(0);
}

/* ── Manual sign-in (shown only when auto fails) ── */
function driveSignIn(){
  driveUI('Signing in…', 'A Google popup will appear.', false, false);
  Drive.tokenClient.requestAccessToken({ prompt: 'consent' });
}

/* ── Load files from Drive ── */
async function driveLoadFiles(){
  driveUI('Finding your Portfolio_Dashboard folder…', '', false, false);
  try {
    // 1. Find the Portfolio_Dashboard folder
    const folderId = await driveFindFolder();
    if(!folderId){
      driveUI('Folder not found.',
        'Make sure "Portfolio_Dashboard" exists directly under My Drive.',
        false, true);
      return;
    }

    // 2. List files in the folder
    driveUI('Reading files from ' + Drive.FOLDER_PATH + '…', '', false, false);
    const files = await driveListFiles(folderId);
    if(!files || files.length === 0){
      driveUI('No files found in Portfolio_Dashboard.', 'Upload your 3 broker files to Google Drive.', false, true);
      return;
    }

    // 3. Download, detect broker, parse each file
    let rows = '';
    const detected = {};
    let loadedCount = 0;

    for(const file of files){
      const name = file.name;
      const ext  = name.split('.').pop().toLowerCase();
      if(!['xlsx','xls','csv'].includes(ext)) continue;
      if(name.startsWith('~') || name.startsWith('.')) continue;

      driveUI('Loading ' + name + '…', '', false, false);
      try {
        const ab     = await driveDownloadFile(file.id);
        const broker = Parsers.detectBroker(ab, name);

        if(!broker){
          rows += driveFileRow(name, 'Could not identify broker', false);
          continue;
        }
        if(detected[broker]){
          rows += driveFileRow(name, 'Duplicate ' + broker + ' — skipped', false);
          continue;
        }

        State.data[broker]  = broker === 'icici' ? Parsers.icici(ab) : Parsers[broker](ab);
        State.files[broker] = name;
        detected[broker]    = true;
        loadedCount++;
        rows += driveFileRow(name, broker.toUpperCase() + ' loaded', true);

      } catch(err){
        rows += driveFileRow(name, 'Error: ' + err.message, false);
      }
    }

    // 4. Show result
    if(loadedCount === 3){
      driveUI('All 3 files loaded successfully!', Drive.FOLDER_PATH, false, true, rows);
      State.driveLoadedAt = new Date();
      // Cache token for this session
      sessionStorage.setItem('pl_drive_token', Drive.token);
      sessionStorage.setItem('pl_drive_expiry', Date.now() + 55 * 60 * 1000); // 55 min
      checkReadyState();
      // Auto-build dashboard
      setTimeout(() => buildDashboard(), 400);

    } else if(loadedCount > 0){
      driveUI(loadedCount + ' of 3 files loaded.', 'Some files could not be read — see details below.', false, true, rows);
      checkReadyState();

    } else {
      driveUI('No recognisable files found.', 'Check that your 3 broker files are in the folder.', false, true, rows);
    }

  } catch(err){
    if(err.status === 401){
      // Token expired — ask user to sign in again
      Drive.token = null;
      sessionStorage.removeItem('pl_drive_token');
      driveUI('Session expired.', 'Please sign in again.', true, false);
    } else {
      driveUI('Error: ' + err.message, 'Click Reload to try again.', false, true);
    }
  }
}

/* ── Drive API calls ── */
async function driveApiFetch(url){
  const resp = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + Drive.token }
  });
  if(!resp.ok){
    const err = new Error('Drive API error ' + resp.status);
    err.status = resp.status;
    throw err;
  }
  return resp;
}

async function driveFindFolder(){
  const q = encodeURIComponent(
    "name='Portfolio_Dashboard' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false"
  );
  const resp = await driveApiFetch(Drive.API_BASE + '/files?q=' + q + '&fields=files(id,name)');
  const data = await resp.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

async function driveListFiles(folderId){
  const q = encodeURIComponent(
    "'" + folderId + "' in parents and trashed=false and (name contains '.xlsx' or name contains '.xls' or name contains '.csv')"
  );
  const resp = await driveApiFetch(Drive.API_BASE + '/files?q=' + q + '&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc');
  const data = await resp.json();
  return data.files || [];
}

async function driveDownloadFile(fileId){
  const resp = await driveApiFetch(Drive.API_BASE + '/files/' + fileId + '?alt=media');
  return await resp.arrayBuffer();
}
