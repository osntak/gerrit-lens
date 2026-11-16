'use strict';

const { t, setLang } = self.LensCore;
const $ = (id) => document.getElementById(id);
const BRIDGE_ORIGIN = 'http://127.0.0.1/*';

function applyI18n() {
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
}

async function main() {
  const s = await chrome.storage.local.get({ enabled: true, theme: 'auto', lang: 'auto', bridgePort: 7357 });
  setLang(s.lang);
  applyI18n();
  // Nothing chosen yet: show what the browser suggests, but only as a starting value.
  const theme = s.theme === 'dark' || s.theme === 'light' ? s.theme : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  $('lang').value = self.LensCore.getLang();
  $('lang').onchange = async () => { await chrome.storage.local.set({ lang: $('lang').value }); location.reload(); };
  $('enabled').checked = s.enabled;
  $('theme').value = theme;
  $('enabled').onchange = () => chrome.storage.local.set({ enabled: $('enabled').checked });
  $('theme').onchange = () => { document.documentElement.dataset.theme = $('theme').value; chrome.storage.local.set({ theme: $('theme').value }); };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let origin = '';
  try { const u = new URL(tab?.url || ''); if (/^https?:$/.test(u.protocol)) origin = u.origin; } catch { /* chrome:// etc. */ }

  const active = origin && (await chrome.permissions.contains({ origins: [`${origin}/*`] }));
  $('site-text').textContent = !origin ? t('siteNone') : `${t(active ? 'siteOn' : 'siteOff')}: ${origin}`;
  if (origin) {
    $('site-btn').hidden = false;
    $('site-btn').textContent = t(active ? 'siteDisable' : 'siteEnable');
    $('site-btn').className = active ? '' : 'primary';
    $('site-btn').onclick = async () => {
      // The service worker re-registers on permission changes; nothing else to save.
      if (active) {
        await chrome.permissions.remove({ origins: [`${origin}/*`] });
      } else {
        // permissions.request must run straight from the click, before any await.
        // The popup may close while Chrome shows the prompt; that is fine.
        if (!(await chrome.permissions.request({ origins: [`${origin}/*`] }))) return;
      }
      await chrome.runtime.sendMessage({ type: 'lens:register' });
      chrome.tabs.reload(tab.id);
      window.close();
    };
  }

  for (const b of document.querySelectorAll('.cmd button')) {
    const code = b.parentElement.querySelector('code');
    code.title = code.textContent;
    b.onclick = async () => { await navigator.clipboard.writeText(code.textContent); b.textContent = t('copied'); };
  }
  $('bridge-btn').onclick = async () => {
    if (await chrome.permissions.request({ origins: [BRIDGE_ORIGIN] })) pingBridge();
  };
  pingBridge();
}

async function pingBridge() {
  const state = $('bridge-state');
  const granted = await chrome.permissions.contains({ origins: [BRIDGE_ORIGIN] });
  $('bridge-btn').hidden = granted;
  $('bridge-granted').hidden = !granted;
  const r = granted ? await chrome.runtime.sendMessage({ type: 'lens:bridge-ping' }) : null;
  const on = !!r?.ok;
  // Connected: the steps are done, show only how to use it.
  $('bridge-guide').hidden = on;
  $('bridge-done').hidden = !on;
  state.textContent = on ? t('bridgeOn') : granted ? t('bridgeOff') : t('bridgeNoPerm');
  state.className = on ? 'ok' : 'sub';
}

main();
