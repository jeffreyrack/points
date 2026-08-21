/**
 * Points tracker API.
 *
 * Deploy as: Web app / Execute as "Me" / Who has access "Anyone".
 * Run setup() once from the editor to build and seed the sheets.
 *
 * Everything is served over GET + JSONP so the front end works from any
 * origin, including a plain index.html opened from the phone's filesystem.
 */

const USERS_SHEET = 'Users';
const REWARDS_SHEET = 'Rewards';
const LOG_SHEET = 'Log';
const LOG_LIMIT = 20;

/** Creates the three sheets and seeds them. Safe to re-run; it won't clobber existing sheets. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss.getSheetByName(USERS_SHEET)) {
    const s = ss.insertSheet(USERS_SHEET);
    s.getRange('A1:B1').setValues([['Name', 'Points']]).setFontWeight('bold');
    s.getRange('A2:B3').setValues([['Jake', 25], ['Luke', 25]]);
    s.setFrozenRows(1);
  }

  if (!ss.getSheetByName(REWARDS_SHEET)) {
    const s = ss.insertSheet(REWARDS_SHEET);
    s.getRange('A1:C1').setValues([['Reward', 'Cost', 'Emoji']]).setFontWeight('bold');
    s.getRange('A2:C3').setValues([
      ['Ice Cream', 30, '🍦'],
      ['Extra book', 5, '📚'],
    ]);
    s.setFrozenRows(1);
  }

  if (!ss.getSheetByName(LOG_SHEET)) {
    const s = ss.insertSheet(LOG_SHEET);
    s.getRange('A1:F1')
      .setValues([['Timestamp', 'User', 'Action', 'Detail', 'Delta', 'Balance']])
      .setFontWeight('bold');
    s.setFrozenRows(1);
  }

  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0) ss.deleteSheet(blank);
}

function doGet(e) {
  const p = (e && e.parameter) || {};

  // A bare hit on the /exec URL is a browser asking for the app itself.
  // Anything with an action is the app calling back for data.
  if (!p.action) return servePage();

  let payload;
  try {
    switch (p.action || 'state') {
      case 'state':
        payload = { ok: true, data: getState() };
        break;
      case 'redeem':
        payload = { ok: true, data: redeem(p.user, p.reward) };
        break;
      case 'adjust':
        payload = { ok: true, data: adjust(p.user, Number(p.delta), p.note || 'Manual adjustment') };
        break;
      default:
        payload = { ok: false, error: 'Unknown action: ' + p.action };
    }
  } catch (err) {
    payload = { ok: false, error: err.message || String(err) };
  }
  return respond(payload, p.callback);
}

/**
 * Serves index.html (pasted into this project as "Page.html") with the Web App
 * URL baked in, so the phone never has to be told where the API lives.
 * Only used if you're not hosting index.html somewhere else.
 */
function servePage() {
  const t = HtmlService.createTemplateFromFile('Page');
  t.WEB_APP_URL = ScriptApp.getService().getUrl();
  return t.evaluate()
    .setTitle('Points')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function respond(payload, callback) {
  const body = JSON.stringify(payload);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + body + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function sheet(name) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!s) throw new Error('Missing sheet "' + name + '". Run setup() from the Apps Script editor.');
  return s;
}

function rows(name) {
  const s = sheet(name);
  if (s.getLastRow() < 2) return [];
  return s.getRange(2, 1, s.getLastRow() - 1, s.getLastColumn()).getValues();
}

function getState() {
  const users = rows(USERS_SHEET)
    .filter(r => String(r[0]).trim())
    .map(r => ({ name: String(r[0]).trim(), points: Number(r[1]) || 0 }));

  const rewards = rows(REWARDS_SHEET)
    .filter(r => String(r[0]).trim())
    .map(r => ({ name: String(r[0]).trim(), cost: Number(r[1]) || 0, emoji: String(r[2] || '').trim() }))
    .sort((a, b) => a.cost - b.cost);

  const log = rows(LOG_SHEET)
    .slice(-LOG_LIMIT)
    .reverse()
    .map(r => ({
      at: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      user: String(r[1]),
      action: String(r[2]),
      detail: String(r[3]),
      delta: Number(r[4]) || 0,
      balance: Number(r[5]) || 0,
    }));

  return { users: users, rewards: rewards, log: log };
}

/** Finds a user's row number (1-indexed, sheet coordinates). Throws if absent. */
function findUserRow(name) {
  const wanted = String(name || '').trim().toLowerCase();
  if (!wanted) throw new Error('No user given.');
  const all = rows(USERS_SHEET);
  for (let i = 0; i < all.length; i++) {
    if (String(all[i][0]).trim().toLowerCase() === wanted) return i + 2;
  }
  throw new Error('Unknown user: ' + name);
}

function findReward(name) {
  const wanted = String(name || '').trim().toLowerCase();
  const match = rows(REWARDS_SHEET).find(r => String(r[0]).trim().toLowerCase() === wanted);
  if (!match) throw new Error('Unknown reward: ' + name);
  return { name: String(match[0]).trim(), cost: Number(match[1]) || 0 };
}

/** Serializes writes so two phones can't spend the same points twice. */
function withLock(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Someone else is updating right now. Try again.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function redeem(userName, rewardName) {
  return withLock(function () {
    const reward = findReward(rewardName);
    const row = findUserRow(userName);
    const cell = sheet(USERS_SHEET).getRange(row, 2);
    const before = Number(cell.getValue()) || 0;

    if (before < reward.cost) {
      throw new Error('Not enough points: has ' + before + ', needs ' + reward.cost + '.');
    }

    const after = before - reward.cost;
    cell.setValue(after);
    const name = sheet(USERS_SHEET).getRange(row, 1).getValue();
    writeLog(name, 'Redeemed', reward.name, -reward.cost, after);

    return Object.assign(getState(), {
      message: name + ' redeemed ' + reward.name + ' for ' + reward.cost + ' points.',
    });
  });
}

function adjust(userName, delta, note) {
  if (!isFinite(delta) || delta === 0) throw new Error('Adjustment must be a non-zero number.');
  return withLock(function () {
    const row = findUserRow(userName);
    const cell = sheet(USERS_SHEET).getRange(row, 2);
    const before = Number(cell.getValue()) || 0;
    const after = Math.max(0, before + Math.round(delta));
    cell.setValue(after);

    const name = sheet(USERS_SHEET).getRange(row, 1).getValue();
    const applied = after - before;
    writeLog(name, applied >= 0 ? 'Earned' : 'Removed', note, applied, after);

    return Object.assign(getState(), {
      message: name + (applied >= 0 ? ' +' : ' ') + applied + ' points (now ' + after + ').',
    });
  });
}

function writeLog(user, action, detail, delta, balance) {
  sheet(LOG_SHEET).appendRow([new Date(), user, action, detail, delta, balance]);
}
