// service_worker.js
// Registers the content scripts on the Gerrit origins the user granted, and
// relays requests to the local AI bridge (content scripts on an http/https
// Gerrit page cannot call 127.0.0.1 themselves without CORS trouble).

'use strict';

const CONTENT_JS = ['vendor/highlight.min.js', 'core.js', 'lens_css.js', 'lens.js'];
const DEFAULTS = { enabled: true, theme: 'auto', bridgePort: 7357 };
const BRIDGE_ORIGIN = 'http://127.0.0.1/*';

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

// The Gerrit sites are exactly the host permissions Chrome has granted (minus
// the local bridge). No separate list is kept: the popup closes as soon as
// Chrome shows its permission prompt, so anything it meant to save after the
// prompt could be lost.
async function registerScripts() {
  const { origins = [] } = await chrome.permissions.getAll();
  const matches = origins.filter((o) => o !== BRIDGE_ORIGIN && /^https?:\/\/[^*]+\/\*$/.test(o));
  try { await chrome.scripting.unregisterContentScripts(); } catch { /* none yet */ }
  if (!matches.length) return;
  await chrome.scripting.registerContentScripts([{
    id: 'lens',
    matches,
    js: CONTENT_JS,
    runAt: 'document_start',
  }]);
}

chrome.runtime.onInstalled.addListener(registerScripts);
chrome.runtime.onStartup.addListener(registerScripts);
// A site was just allowed: register for future loads, and bring Lens into the
// tabs already open on it, so it shows up without a manual reload.
chrome.permissions.onAdded.addListener(async ({ origins = [] }) => {
  await registerScripts();
  for (const origin of origins) {
    if (origin === BRIDGE_ORIGIN) continue;
    for (const tab of await chrome.tabs.query({ url: origin })) {
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_JS }).catch(() => {});
    }
  }
});
chrome.permissions.onRemoved.addListener(registerScripts);

async function bridgeFetch(path, init) {
  const { bridgePort } = await settings();
  const resp = await fetch(`http://127.0.0.1:${bridgePort}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });
  if (!resp.ok) throw new Error(`bridge ${resp.status}`);
  return resp.json();
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    switch (msg?.type) {
      case 'lens:register':
        await registerScripts();
        return { ok: true };
      case 'lens:annotations':
        return { ok: true, data: await bridgeFetch(`/annotations/${Number(msg.change)}`) };
      case 'lens:annotation-status':
        return {
          ok: true,
          data: await bridgeFetch(`/annotations/${Number(msg.change)}/${encodeURIComponent(msg.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: msg.status }),
          }),
        };
      case 'lens:bridge-ping':
        return { ok: true, data: await bridgeFetch('/health') };
      default:
        return { ok: false, error: 'unknown message' };
    }
  })().then(reply, (e) => reply({ ok: false, error: String(e?.message || e) }));
  return true;
});
