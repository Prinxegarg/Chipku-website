/**
 * CHIPKU — Google Sheets helper (Extensions → Apps Script → paste this file → Save).
 *
 * Adds a "CHIPKU" menu to the spreadsheet:
 *   • Publish website now        → asks Cloudflare Pages to rebuild the site from the sheet
 *   • Show website sheet config   → prints the JSON the website needs (tab → gid map)
 *   • Set Cloudflare deploy hook  → stores the deploy hook URL privately (Script Properties)
 *   • Schedule daily publish      → optional automatic rebuild once a day
 *
 * Optional: deploy as a Web app to receive verified orders from the checkout function
 * (ORDERS_WEBHOOK_URL) and append them to an "Orders" tab.
 *
 * Secrets (deploy hook URL, webhook secret) live in Script Properties, never in cells.
 */

var TAB_KEYS = {
  'hero banner': 'hero', 'hero': 'hero', 'hero slides': 'hero',
  'posters': 'posters', 'stickers': 'stickers', 'polaroids': 'polaroids', 'photo prints': 'polaroids',
  'variants': 'variants', 'media': 'media', 'categories': 'categories', 'collections': 'categories',
  'offers': 'offers', 'settings': 'settings', 'offer settings': 'settings',
  'reviews': 'reviews', 'review media': 'review_media',
  'custom products': 'custom_products', 'recommendations': 'recommendations',
  'faq': 'faq', 'details': 'details'
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CHIPKU')
    .addItem('Publish website now', 'publishWebsite')
    .addSeparator()
    .addItem('Show website sheet config', 'showWebsiteConfig')
    .addItem('Set Cloudflare deploy hook', 'setDeployHook')
    .addItem('Schedule daily publish', 'scheduleDailyPublish')
    .addItem('Stop scheduled publish', 'stopScheduledPublish')
    .addToUi();
}

function props_() {
  return PropertiesService.getScriptProperties();
}

/** Triggers a Cloudflare Pages build. The build checks every row; if a check fails the live site is unchanged. */
function publishWebsite() {
  var hook = props_().getProperty('DEPLOY_HOOK_URL');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!hook) {
    SpreadsheetApp.getUi().alert('Set the Cloudflare deploy hook first (CHIPKU → Set Cloudflare deploy hook).');
    return;
  }
  var res = UrlFetchApp.fetch(hook, { method: 'post', muteHttpExceptions: true });
  var ok = res.getResponseCode() >= 200 && res.getResponseCode() < 300;
  ss.toast(
    ok
      ? 'Publish started. If every check passes, the site updates in a few minutes. Google can take up to 5 minutes to refresh published tabs — publish again if a very recent edit is missing.'
      : 'Publish request failed (HTTP ' + res.getResponseCode() + '). Check the deploy hook URL.',
    'CHIPKU',
    12
  );
  if (ok) props_().setProperty('LAST_PUBLISH', new Date().toISOString());
}

function setDeployHook() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt(
    'Cloudflare deploy hook',
    'Paste the deploy hook URL from Cloudflare Pages → your project → Settings → Builds → Deploy hooks.',
    ui.ButtonSet.OK_CANCEL
  );
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var url = r.getResponseText().trim();
  if (!/^https:\/\/api\.cloudflare\.com\//.test(url)) {
    ui.alert('That does not look like a Cloudflare deploy hook URL.');
    return;
  }
  props_().setProperty('DEPLOY_HOOK_URL', url);
  ui.alert('Saved. Use CHIPKU → Publish website now to rebuild the site.');
}

/** Prints the CHIPKU_SHEETS_CONFIG value for Cloudflare Pages (tab name → gid). */
function showWebsiteConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = {};
  var unknown = [];
  ss.getSheets().forEach(function (sh) {
    var key = TAB_KEYS[sh.getName().trim().toLowerCase().replace(/_/g, ' ')];
    if (key) tabs[key] = String(sh.getSheetId());
    else if (sh.getName() !== 'Orders') unknown.push(sh.getName());
  });
  var config = {
    publishedUrl: 'PASTE the link from File → Share → Publish to web (Entire document, CSV)',
    tabs: tabs
  };
  var html =
    '<p style="font:14px Arial">1. File → Share → <b>Publish to web</b> → Entire document → <b>Comma-separated values (.csv)</b> → Publish. Copy the link into <code>publishedUrl</code> below.</p>' +
    '<p style="font:14px Arial">2. In Cloudflare Pages → Settings → Environment variables, set <b>CHIPKU_SHEETS_CONFIG</b> to this JSON (and <b>CHIPKU_REQUIRE_LIVE</b> = 1):</p>' +
    '<textarea style="width:100%;height:220px;font:12px monospace">' + JSON.stringify(config, null, 2) + '</textarea>' +
    (unknown.length ? '<p style="font:13px Arial;color:#595959">Tabs not used by the website: ' + unknown.join(', ') + '</p>' : '');
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(560).setHeight(420), 'Website sheet config');
}

function scheduleDailyPublish() {
  stopScheduledPublish();
  ScriptApp.newTrigger('publishWebsite').timeBased().everyDays(1).atHour(6).inTimezone('Asia/Kolkata').create();
  SpreadsheetApp.getActiveSpreadsheet().toast('The website will rebuild daily at about 6 am IST.', 'CHIPKU', 8);
}

function stopScheduledPublish() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'publishWebsite') ScriptApp.deleteTrigger(t);
  });
}

/**
 * Optional orders receiver. Deploy → New deployment → Web app (Execute as: Me, Access: Anyone).
 * Put the web app URL in ORDERS_WEBHOOK_URL and the same random string in Script Property
 * ORDERS_WEBHOOK_SECRET and Cloudflare's ORDERS_WEBHOOK_SECRET.
 *
 * Orders contain customer contact details, so they are written to a SEPARATE, private
 * spreadsheet (Script Property ORDERS_SPREADSHEET_ID) — never to this content sheet,
 * which is published to the web.
 */
function doPost(e) {
  var expected = props_().getProperty('ORDERS_WEBHOOK_SECRET');
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput('bad request');
  }
  if (!expected || data.secret !== expected) return ContentService.createTextOutput('forbidden');

  var ordersId = props_().getProperty('ORDERS_SPREADSHEET_ID');
  if (!ordersId) return ContentService.createTextOutput('orders spreadsheet not configured');
  var ss = SpreadsheetApp.openById(ordersId);
  var sh = ss.getSheetByName('Orders') || ss.insertSheet('Orders');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['verified_at', 'order_id', 'payment_id', 'amount_inr', 'name', 'phone', 'email', 'address', 'city', 'state', 'pincode', 'items', 'totals', 'catalog_version']);
  }
  var n = data.notes || {};
  var items = [n.items_1, n.items_2, n.items_3, n.items_4].filter(Boolean).join('');
  // Never write sheet-formula-looking text from customers into cells.
  var safe = function (v) {
    v = String(v == null ? '' : v);
    return /^[=+\-@]/.test(v) ? "'" + v : v;
  };
  sh.appendRow([
    data.verified_at, data.order_id, data.payment_id, (data.amount_paise || 0) / 100,
    safe(n.name), safe(n.phone), safe(n.email), safe(n.address), safe(n.city), safe(n.state), safe(n.pincode),
    safe(items), safe(n.totals), safe(n.catalog)
  ]);
  return ContentService.createTextOutput('ok');
}
