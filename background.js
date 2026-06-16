chrome.runtime.onInstalled.addListener(function() {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function() {});
});

chrome.action.onClicked.addListener(function(tab) {
  chrome.sidePanel.open({ tabId: tab.id }).catch(function() {});
});

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'checkLink') {
    checkLink(message.url).then(sendResponse).catch(function(err) {
      sendResponse({ url: message.url, status: 0, ok: false, error: err.message });
    });
    return true;
  }
});

async function checkLink(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { url, status: 0, ok: false, error: 'Niet-HTTP URL overgeslagen' };
  }
  const controller = new AbortController();
  const timeout = setTimeout(function() { controller.abort(); }, 10000);
  try {
    let response;
    try {
      response = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
    } catch (headErr) {
      response = await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'follow' });
    }
    clearTimeout(timeout);
    return { url, status: response.status, ok: response.ok, redirected: response.redirected, finalUrl: response.url !== url ? response.url : null };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') return { url, status: 0, ok: false, error: 'Time-out (>10s)' };
    return { url, status: 0, ok: false, error: err.message };
  }
}
