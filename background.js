// Background service worker for LiveGang Checker
// Handles fetch requests for link checking to avoid CORS issues

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'checkLink') {
    checkLink(message.url).then(sendResponse).catch(err => {
      sendResponse({ url: message.url, status: 0, ok: false, error: err.message });
    });
    return true; // Keep message channel open for async response
  }
});

async function checkLink(url) {
  // Skip non-http(s) URLs
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { url, status: 0, ok: false, error: 'Niet-HTTP URL overgeslagen' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    // Try HEAD first (faster, less bandwidth)
    let response;
    try {
      response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow'
      });
    } catch (headErr) {
      // Fall back to GET if HEAD fails or is not supported
      response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow'
      });
    }

    clearTimeout(timeout);

    return {
      url,
      status: response.status,
      ok: response.ok,
      redirected: response.redirected,
      finalUrl: response.url !== url ? response.url : null
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return { url, status: 0, ok: false, error: 'Time-out (>10s)' };
    }
    return { url, status: 0, ok: false, error: err.message };
  }
}
