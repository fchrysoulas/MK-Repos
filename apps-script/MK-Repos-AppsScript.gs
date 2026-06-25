/**
 * MK-Repos Google Apps Script Bridge v1.3.0
 *
 * Setup:
 * 1. Create a Google Sheet.
 * 2. Extensions -> Apps Script.
 * 3. Paste this file as Code.gs.
 * 4. Project Settings -> Script Properties:
 *    MK_REPOS_TOKEN = your shared repository token
 *    Optional: MK_REPOS_SPREADSHEET_ID = target spreadsheet ID
 * 5. Run mkReposSetup() once from the Apps Script editor and authorize it.
 * 6. Deploy -> New deployment -> Web app:
 *    Execute as: Me
 *    Who has access: Anyone with the link
 * 7. Paste the /exec URL and the same token into Foundry's MK-Repos settings.
 */

const MK_REPOS_VERSION = '1.3.0';
const MK_REPOS_CHUNK_SIZE = 45000;

const MK_REPOS_SHEETS = {
  Characters: [
    'vaultId', 'name', 'owner', 'systemId', 'systemVersion', 'foundryVersion',
    'actorType', 'templateId', 'level', 'className', 'ancestry', 'revision',
    'updatedAt', 'lockedBy', 'status'
  ],
  CharacterFields: [
    'vaultId', 'revision', 'section', 'label', 'path', 'value', 'type', 'editable', 'templateId'
  ],
  Items: [
    'vaultId', 'revision', 'itemId', 'name', 'type', 'quantity', 'equipped',
    'description', 'systemJson', 'itemJson'
  ],
  Effects: [
    'vaultId', 'revision', 'effectId', 'name', 'disabled', 'durationJson', 'changesJson', 'effectJson'
  ],
  RawActor: [
    'vaultId', 'revision', 'chunkIndex', 'actorJsonChunk'
  ],
  Templates: [
    'templateId', 'systemId', 'systemVersion', 'actorType', 'templateVersion', 'fieldsJson'
  ],
  ConnectionTests: [
    'testId', 'createdAt', 'owner', 'systemId', 'systemVersion', 'foundryVersion', 'message'
  ]
};

function doGet(e) {
  return mkReposJson({
    ok: true,
    module: 'MK-Repos',
    version: MK_REPOS_VERSION,
    message: 'Use POST requests from the Foundry module.'
  });
}

function doPost(e) {
  try {
    const payload = mkReposParsePayload(e);
    mkReposCheckToken(payload.token);
    const action = String(payload.action || '').trim();

    if (action === 'setup') return mkReposJson(mkReposSetup());
    if (action === 'testConnection') return mkReposJson(mkReposTestConnection(payload));
    if (action === 'list') return mkReposJson(mkReposList());
    if (action === 'get') return mkReposJson(mkReposGet(payload.vaultId));
    if (action === 'getMeta') return mkReposJson(mkReposGetMeta(payload.vaultId));
    if (action === 'push') return mkReposJson(mkReposPush(payload));
    if (action === 'lock') return mkReposJson(mkReposLock(payload));
    if (action === 'unlock') return mkReposJson(mkReposUnlock(payload));

    return mkReposJson({ ok: false, error: 'unknown_action', message: 'Unknown action: ' + action });
  } catch (err) {
    return mkReposJson({ ok: false, error: err.code || 'exception', message: String(err && err.message || err) });
  }
}

function mkReposParsePayload(e) {
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  try {
    return JSON.parse(raw);
  } catch (err) {
    const error = new Error('Invalid JSON payload.');
    error.code = 'invalid_json';
    throw error;
  }
}

function mkReposCheckToken(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('MK_REPOS_TOKEN');
  if (!expected) {
    const error = new Error('MK_REPOS_TOKEN script property is not set.');
    error.code = 'token_not_configured';
    throw error;
  }
  if (String(token || '') !== String(expected)) {
    const error = new Error('Invalid repository token.');
    error.code = 'invalid_token';
    throw error;
  }
}

function mkReposJson(object) {
  return ContentService
    .createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}

function mkReposSpreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty('MK_REPOS_SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    const error = new Error('No active spreadsheet. Bind this script to a Sheet or set MK_REPOS_SPREADSHEET_ID.');
    error.code = 'missing_spreadsheet';
    throw error;
  }
  return active;
}

function mkReposSheet(name) {
  const ss = mkReposSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const headers = MK_REPOS_SHEETS[name];
  if (!headers) return sheet;

  const current = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn() || headers.length)).getValues()[0];
  const needsHeaders = headers.some((h, i) => current[i] !== h);
  if (needsHeaders) {
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function mkReposSetup() {
  Object.keys(MK_REPOS_SHEETS).forEach(name => mkReposSheet(name));
  return { ok: true, version: MK_REPOS_VERSION, message: 'MK-Repos repository sheets are ready.' };
}

function mkReposTestConnection(payload) {
  mkReposSetup();

  const now = new Date().toISOString();
  const row = {
    testId: String(payload.testId || ('test-' + now.replace(/[^0-9]/g, ''))).trim(),
    createdAt: now,
    owner: payload.owner || '',
    systemId: payload.systemId || '',
    systemVersion: payload.systemVersion || '',
    foundryVersion: payload.foundryVersion || '',
    message: payload.message || 'MK-Repos connection test'
  };

  const sheet = mkReposSheet('ConnectionTests');
  const headers = MK_REPOS_SHEETS.ConnectionTests;
  sheet.appendRow(headers.map(h => row[h] == null ? '' : row[h]));

  return {
    ok: true,
    version: MK_REPOS_VERSION,
    testId: row.testId,
    createdAt: row.createdAt,
    message: 'Connection OK. Dummy record added.'
  };
}

function mkReposReadTable(name) {
  const sheet = mkReposSheet(name);
  const lastRow = sheet.getLastRow();
  const headers = MK_REPOS_SHEETS[name];
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map((row, index) => {
    const object = { __row: index + 2 };
    headers.forEach((h, i) => object[h] = row[i]);
    return object;
  });
}

function mkReposFindCharacterRow(vaultId) {
  if (!vaultId) return null;
  return mkReposReadTable('Characters').find(row => String(row.vaultId) === String(vaultId)) || null;
}

function mkReposList() {
  const characters = mkReposReadTable('Characters')
    .filter(row => row.vaultId)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(row => {
      delete row.__row;
      return row;
    });
  return { ok: true, version: MK_REPOS_VERSION, characters };
}

function mkReposGetMeta(vaultId) {
  const character = mkReposFindCharacterRow(vaultId);
  if (!character) return { ok: false, error: 'not_found', message: 'No character found for vaultId: ' + vaultId };
  delete character.__row;
  return { ok: true, version: MK_REPOS_VERSION, character };
}

function mkReposGet(vaultId) {
  const meta = mkReposFindCharacterRow(vaultId);
  if (!meta) return { ok: false, error: 'not_found', message: 'No character found for vaultId: ' + vaultId };

  const chunks = mkReposReadTable('RawActor')
    .filter(row => String(row.vaultId) === String(vaultId))
    .sort((a, b) => Number(a.chunkIndex) - Number(b.chunkIndex));

  if (!chunks.length) return { ok: false, error: 'missing_actor_json', message: 'No RawActor data found for vaultId: ' + vaultId };

  const actorJson = chunks.map(row => row.actorJsonChunk).join('');
  delete meta.__row;

  return {
    ok: true,
    version: MK_REPOS_VERSION,
    character: meta,
    revision: Number(meta.revision || 0),
    actorJson
  };
}

function mkReposPush(payload) {
  mkReposSetup();

  const vaultId = String(payload.vaultId || (payload.metadata && payload.metadata.vaultId) || '').trim();
  if (!vaultId) return { ok: false, error: 'missing_vault_id', message: 'Push requires vaultId.' };

  const actorJson = String(payload.actorJson || '');
  if (!actorJson) return { ok: false, error: 'missing_actor_json', message: 'Push requires actorJson.' };

  const existing = mkReposFindCharacterRow(vaultId);
  const existingRevision = existing ? Number(existing.revision || 0) : 0;
  const baseRevision = Number(payload.baseRevision || 0);
  const force = payload.force === true || String(payload.force) === 'true';

  if (existing && !force && baseRevision !== existingRevision) {
    return {
      ok: false,
      error: 'conflict',
      message: 'Revision conflict.',
      repositoryRevision: existingRevision,
      baseRevision
    };
  }

  const nextRevision = existingRevision + 1;
  const now = new Date().toISOString();
  const meta = payload.metadata || {};

  mkReposUpsertCharacterRow({
    vaultId,
    name: meta.name || '',
    owner: meta.owner || '',
    systemId: meta.systemId || '',
    systemVersion: meta.systemVersion || '',
    foundryVersion: meta.foundryVersion || '',
    actorType: meta.actorType || '',
    templateId: meta.templateId || '',
    level: meta.level || '',
    className: meta.className || '',
    ancestry: meta.ancestry || '',
    revision: nextRevision,
    updatedAt: now,
    lockedBy: meta.lockedBy || '',
    status: meta.status || 'synced'
  });

  mkReposReplaceRows('CharacterFields', vaultId, (payload.fields || []).map(row => ({
    vaultId,
    revision: nextRevision,
    section: row.section || '',
    label: row.label || '',
    path: row.path || '',
    value: row.value == null ? '' : row.value,
    type: row.type || '',
    editable: row.editable === false ? false : true,
    templateId: row.templateId || meta.templateId || ''
  })));

  mkReposReplaceRows('Items', vaultId, (payload.items || []).map(row => ({
    vaultId,
    revision: nextRevision,
    itemId: row.itemId || '',
    name: row.name || '',
    type: row.type || '',
    quantity: row.quantity == null ? '' : row.quantity,
    equipped: row.equipped == null ? '' : row.equipped,
    description: row.description || '',
    systemJson: row.systemJson || '',
    itemJson: row.itemJson || ''
  })));

  mkReposReplaceRows('Effects', vaultId, (payload.effects || []).map(row => ({
    vaultId,
    revision: nextRevision,
    effectId: row.effectId || '',
    name: row.name || '',
    disabled: row.disabled === true || String(row.disabled) === 'true',
    durationJson: row.durationJson || '',
    changesJson: row.changesJson || '',
    effectJson: row.effectJson || ''
  })));

  const chunks = mkReposChunk(actorJson, MK_REPOS_CHUNK_SIZE).map((chunk, index) => ({
    vaultId,
    revision: nextRevision,
    chunkIndex: index,
    actorJsonChunk: chunk
  }));
  mkReposReplaceRows('RawActor', vaultId, chunks);

  return {
    ok: true,
    version: MK_REPOS_VERSION,
    vaultId,
    revision: nextRevision,
    updatedAt: now
  };
}

function mkReposUpsertCharacterRow(rowObject) {
  const sheet = mkReposSheet('Characters');
  const headers = MK_REPOS_SHEETS.Characters;
  const existing = mkReposFindCharacterRow(rowObject.vaultId);
  const values = headers.map(h => rowObject[h] == null ? '' : rowObject[h]);
  if (existing) sheet.getRange(existing.__row, 1, 1, headers.length).setValues([values]);
  else sheet.appendRow(values);
}

function mkReposReplaceRows(sheetName, vaultId, rowObjects) {
  const sheet = mkReposSheet(sheetName);
  const headers = MK_REPOS_SHEETS[sheetName];

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    const keep = values.filter(row => String(row[0]) !== String(vaultId));
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
    if (keep.length) sheet.getRange(2, 1, keep.length, headers.length).setValues(keep);
  }

  if (rowObjects.length) {
    const startRow = sheet.getLastRow() + 1;
    const values = rowObjects.map(row => headers.map(h => row[h] == null ? '' : row[h]));
    sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);
  }
}

function mkReposChunk(text, size) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

function mkReposLock(payload) {
  const vaultId = String(payload.vaultId || '').trim();
  const lockedBy = String(payload.lockedBy || payload.user || '').trim();
  const row = mkReposFindCharacterRow(vaultId);
  if (!row) return { ok: false, error: 'not_found', message: 'No character found for vaultId: ' + vaultId };
  row.lockedBy = lockedBy || 'locked';
  mkReposUpsertCharacterRow(row);
  return { ok: true, vaultId, lockedBy: row.lockedBy };
}

function mkReposUnlock(payload) {
  const vaultId = String(payload.vaultId || '').trim();
  const row = mkReposFindCharacterRow(vaultId);
  if (!row) return { ok: false, error: 'not_found', message: 'No character found for vaultId: ' + vaultId };
  row.lockedBy = '';
  mkReposUpsertCharacterRow(row);
  return { ok: true, vaultId };
}
