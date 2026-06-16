// LiveGang Checker – Popup Script

'use strict';

// ── Tab navigation ──────────────────────────────────────────────────────────

const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    tabBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    tabPanels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    document.getElementById(`panel-${target}`).classList.add('active');
  });
});

// ── Refresh button ──────────────────────────────────────────────────────────

document.getElementById('btn-refresh').addEventListener('click', function() {
  resetUI();
  runChecks();
});

function resetUI() {
  // Reset headings
  document.getElementById('headings-loading').style.display = '';
  document.getElementById('headings-content').style.display = 'none';
  document.getElementById('headings-content').innerHTML = '';
  // Reset wcag
  document.getElementById('wcag-loading').style.display = '';
  document.getElementById('wcag-content').style.display = 'none';
  document.getElementById('wcag-content').innerHTML = '';
  // Reset links
  document.getElementById('links-loading').style.display = '';
  document.getElementById('links-content').style.display = 'none';
  document.getElementById('links-content').innerHTML = '';
  // Reset meta
  document.getElementById('meta-loading').style.display = '';
  document.getElementById('meta-content').style.display = 'none';
  document.getElementById('meta-content').innerHTML = '';
  // Reset link checker state
  allLinks = [];
  checkingActive = false;
}

// ── Run content script on the active tab ───────────────────────────────────

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function runChecks() {
  let tab;
  try {
    tab = await getActiveTab();
  } catch (e) {
    showError('headings-content', 'headings-loading', 'Kan geen actieve tab vinden.');
    return;
  }

  let results;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: runPageChecks
    });
    results = result && result.result;
  } catch (e) {
    const msg = `Kan pagina niet analyseren. Is het een gewone webpagina? (${e.message})`;
    showError('headings-content', 'headings-loading', msg);
    showError('wcag-content', 'wcag-loading', msg);
    showLinksError(msg);
    showError('meta-content', 'meta-loading', msg);
    return;
  }

  if (!results) {
    const msg = 'Geen resultaten ontvangen van de pagina.';
    showError('headings-content', 'headings-loading', msg);
    showError('wcag-content', 'wcag-loading', msg);
    showLinksError(msg);
    showError('meta-content', 'meta-loading', msg);
    return;
  }

  renderHeadings(results.headings);
  renderWcag(results.wcag);
  initLinks(results.links);
  renderMeta(results.meta);
}

function showError(contentId, loadingId, message) {
  document.getElementById(loadingId).style.display = 'none';
  const el = document.getElementById(contentId);
  el.style.display = 'block';
  el.innerHTML = '<div class="issue-item error"><span>⚠️</span><span>' + escHtml(message) + '</span></div>';
}

function showLinksError(message) {
  document.getElementById('links-loading').style.display = 'none';
  const el = document.getElementById('links-content');
  el.style.display = 'block';
  el.innerHTML = '<div class="issue-item error"><span>⚠️</span><span>' + escHtml(message) + '</span></div>';
}

// ── H-Structuur rendering ───────────────────────────────────────────────────

function renderHeadings(headings) {
  document.getElementById('headings-loading').style.display = 'none';
  const container = document.getElementById('headings-content');
  container.style.display = 'block';

  const issues = analyzeHeadings(headings);
  let html = '';

  // Issues block
  html += '<div class="heading-issues">';
  if (issues.length === 0) {
    html += '<div class="issue-item ok"><span>✓</span><span>H-structuur ziet er goed uit — volgorde klopt.</span></div>';
  } else {
    issues.forEach(function(issue) {
      if (issue.items && issue.items.length > 0) {
        html += '<details class="issue-details issue-' + issue.type + '">';
        html += '<summary class="issue-summary"><span class="issue-icon">' + issue.icon + '</span><span>' + escHtml(issue.message) + '</span><span class="details-toggle"></span></summary>';
        html += '<ul class="issue-detail-list">';
        issue.items.forEach(function(it) {
          var text = typeof it === 'string' ? it : it.text;
          var id = typeof it === 'object' && it.lgcId ? it.lgcId : null;
          html += '<li' + (id ? ' class="clickable" data-lgc="' + escHtml(id) + '" title="Klik om naar dit element te springen"' : '') + '>';
          html += escHtml(text);
          if (id) html += ' <span class="jump-hint">↗</span>';
          html += '</li>';
        });
        html += '</ul></details>';
      } else {
        html += '<div class="issue-item ' + issue.type + '"><span>' + issue.icon + '</span><span>' + escHtml(issue.message) + '</span></div>';
      }
    });
  }
  html += '</div>';

  // Heading count info
  const semanticCount = headings.filter(function(h) { return h.source === 'tag'; }).length;
  const classCount = headings.filter(function(h) { return h.source === 'class'; }).length;
  const ariaCount = headings.filter(function(h) { return h.source === 'aria'; }).length;
  let subtitle = headings.length + ' kopelementen gevonden';
  const extras = [];
  if (classCount > 0) extras.push(classCount + ' via CSS-klasse');
  if (ariaCount > 0) extras.push(ariaCount + ' via ARIA');
  if (extras.length) subtitle += ' (' + extras.join(', ') + ')';

  html += '<div class="section-header">' + escHtml(subtitle) + '</div>';

  if (headings.length === 0) {
    html += '<div class="no-headings">Geen kopelementen (h1–h6) gevonden op deze pagina.</div>';
  } else {
    html += '<div class="heading-tree">';
    let prevLevel = 0;
    headings.forEach(function(h) {
      const indent = (h.level - 1) * 14;
      const isJump = prevLevel > 0 && h.level > prevLevel + 1;
      html += '<div class="heading-item clickable' + (isJump ? ' issue' : '') + '" style="padding-left:' + (indent + 6) + 'px"' + (h.lgcId ? ' data-lgc="' + escHtml(h.lgcId) + '" title="Klik om naar dit element te springen"' : '') + '>';
      html += '<span class="heading-badge h' + h.level + '-badge">h' + h.level + '</span>';
      if (h.source === 'class') html += '<span class="heading-source-badge">class</span>';
      if (h.source === 'aria') html += '<span class="heading-source-badge aria">aria</span>';
      html += '<span class="heading-text">' + escHtml(h.text) + '</span>';
      if (isJump) html += '<span class="badge warn" style="margin-left:auto;font-size:10px;flex-shrink:0">⚠ overgeslagen</span>';
      if (h.lgcId) html += '<span class="jump-hint">↗</span>';
      html += '</div>';
      prevLevel = h.level;
    });
    html += '</div>';
  }

  container.innerHTML = html;
}

function analyzeHeadings(headings) {
  const issues = [];
  const h1s = headings.filter(function(h) { return h.level === 1; });

  if (h1s.length === 0) {
    issues.push({ type: 'error', icon: '✗', message: 'Geen H1 gevonden op deze pagina.', items: [] });
  } else if (h1s.length > 1) {
    issues.push({
      type: 'warning', icon: '⚠',
      message: h1s.length + ' H1-elementen gevonden — gebruik slechts één H1 per pagina.',
      items: h1s.map(function(h) { return { text: '"' + h.text + '"' + (h.source !== 'tag' ? ' (via ' + h.source + ')' : ''), lgcId: h.lgcId }; })
    });
  }

  let prevLevel = 0;
  let prevText = '';
  let prevLgcId = null;
  headings.forEach(function(h) {
    if (prevLevel > 0 && h.level > prevLevel + 1) {
      issues.push({
        type: 'warning', icon: '⚠',
        message: 'Kopniveau overgeslagen: H' + prevLevel + ' → H' + h.level + ' (niveau H' + (prevLevel + 1) + ' ontbreekt).',
        items: [
          { text: 'Vorig kop (H' + prevLevel + '): "' + prevText + '"', lgcId: prevLgcId },
          { text: 'Volgend kop (H' + h.level + '): "' + h.text + '"', lgcId: h.lgcId }
        ]
      });
    }
    prevLevel = h.level;
    prevText = h.text;
    prevLgcId = h.lgcId || null;
  });

  // Check if heading order is correct (h1 must be first heading)
  if (headings.length > 0 && headings[0].level !== 1 && h1s.length > 0) {
    issues.push({
      type: 'warning', icon: '⚠',
      message: 'De eerste kop op de pagina is geen H1 maar een H' + headings[0].level + '.',
      items: [{ text: 'Eerste kop: "' + headings[0].text + '" (H' + headings[0].level + ')', lgcId: headings[0].lgcId }]
    });
  }

  return issues;
}

// ── WCAG rendering ──────────────────────────────────────────────────────────

const WCAG_META = {
  '1.1.1': { name: 'Alt-teksten', group: 'Waarneembaar' },
  '1.3.1': { name: 'Info en relaties', group: 'Waarneembaar' },
  '1.4.3': { name: 'Contrast (minimum)', group: 'Waarneembaar' },
  '1.4.4': { name: 'Aanpasbare tekst', group: 'Waarneembaar' },
  '1.4.5': { name: 'Afbeeldingsformaten', group: 'Waarneembaar' },
  '2.1.1': { name: 'Toetsenbord', group: 'Bedienbaar' },
  '2.4.1': { name: 'Blokken omzeilen', group: 'Bedienbaar' },
  '2.4.2': { name: 'Paginatitel', group: 'Bedienbaar' },
  '2.4.4': { name: 'Linkdoel + externe links', group: 'Bedienbaar' },
  '2.4.6': { name: 'Koppen en labels', group: 'Bedienbaar' },
  '3.1.1': { name: 'Taal van pagina', group: 'Begrijpelijk' },
  '3.3.2': { name: 'Labels of instructies', group: 'Begrijpelijk' },
  '3.3.4': { name: 'Formulieren', group: 'Begrijpelijk' },
  '4.1.1': { name: 'Parsing (duplicate IDs)', group: 'Robuust' },
  '4.1.2': { name: 'Naam, rol, waarde', group: 'Robuust' }
};

function renderWcag(wcag) {
  document.getElementById('wcag-loading').style.display = 'none';
  const container = document.getElementById('wcag-content');
  container.style.display = 'block';

  let passCount = 0, failCount = 0, warnCount = 0;
  Object.values(wcag).forEach(function(r) {
    if (r.status === 'pass') passCount++;
    else if (r.status === 'fail') failCount++;
    else warnCount++;
  });

  let html = '<div class="link-summary" style="margin-bottom:12px">';
  html += '<div class="link-summary-item" style="background:#dcfce7;color:#16a34a">✓ ' + passCount + ' geslaagd</div>';
  html += '<div class="link-summary-item" style="background:#fee2e2;color:#dc2626">✗ ' + failCount + ' mislukt</div>';
  html += '<div class="link-summary-item" style="background:#fef3c7;color:#d97706">⚠ ' + warnCount + ' waarschuwing</div>';
  html += '</div>';

  const groups = {};
  Object.keys(wcag).forEach(function(criterion) {
    const result = wcag[criterion];
    const meta = WCAG_META[criterion] || { name: criterion, group: 'Overig' };
    if (!groups[meta.group]) groups[meta.group] = [];
    groups[meta.group].push({ criterion: criterion, result: result, meta: meta });
  });

  Object.keys(groups).forEach(function(groupName) {
    html += '<div class="section-header">' + escHtml(groupName) + '</div><div class="wcag-group">';
    groups[groupName].forEach(function(item) {
      const badgeClass = item.result.status === 'pass' ? 'pass' : item.result.status === 'fail' ? 'fail' : 'warn';
      const badgeLabel = item.result.status === 'pass' ? '✓ OK' : item.result.status === 'fail' ? '✗ Fout' : '⚠ Let op';
      const hasItems = item.result.items && item.result.items.length > 0;
      const isExpandable = item.result.status !== 'pass' && hasItems;

      if (isExpandable) {
        html += '<details class="wcag-item wcag-details wcag-' + badgeClass + '">';
        html += '<summary class="wcag-summary">';
        html += '<span class="wcag-criterion">' + escHtml(item.criterion) + '</span>';
        html += '<span class="wcag-name">' + escHtml(item.meta.name) + '</span>';
        html += '<span class="wcag-status"><span class="badge ' + badgeClass + '">' + badgeLabel + '</span></span>';
        html += '<span class="wcag-detail">' + escHtml(item.result.detail || '') + '</span>';
        html += '</summary>';
        html += '<ul class="wcag-items-list">';
        item.result.items.forEach(function(it) {
          var text = typeof it === 'string' ? it : it.text;
          var id = typeof it === 'object' && it.lgcId ? it.lgcId : null;
          html += '<li' + (id ? ' class="clickable" data-lgc="' + escHtml(id) + '" title="Klik om naar dit element te springen"' : '') + '>';
          html += escHtml(text);
          if (id) html += ' <span class="jump-hint">↗</span>';
          html += '</li>';
        });
        html += '</ul>';
        html += '</details>';
      } else {
        html += '<div class="wcag-item wcag-' + badgeClass + '">';
        html += '<span class="wcag-criterion">' + escHtml(item.criterion) + '</span>';
        html += '<span class="wcag-name">' + escHtml(item.meta.name) + '</span>';
        html += '<span class="wcag-status"><span class="badge ' + badgeClass + '">' + badgeLabel + '</span></span>';
        html += '<span class="wcag-detail">' + escHtml(item.result.detail || '') + '</span>';
        html += '</div>';
      }
    });
    html += '</div>';
  });

  container.innerHTML = html;
}

// ── Meta/SEO rendering ──────────────────────────────────────────────────────

function renderMeta(meta) {
  document.getElementById('meta-loading').style.display = 'none';
  const container = document.getElementById('meta-content');
  container.style.display = 'block';

  if (!meta) {
    container.innerHTML = '<div class="issue-item error"><span>⚠️</span><span>Geen meta-data ontvangen.</span></div>';
    return;
  }

  function metaRow(label, badgeClass, badgeLabel, value) {
    var displayVal = value ? escHtml(String(value).substring(0, 100)) : '<em style="opacity:0.5">afwezig</em>';
    return '<div class="meta-row">' +
      '<span class="meta-label">' + escHtml(label) + '</span>' +
      '<span class="meta-badge"><span class="badge ' + badgeClass + '">' + badgeLabel + '</span></span>' +
      '<span class="meta-value">' + displayVal + '</span>' +
      '</div>';
  }

  let html = '';

  // Paginatitel
  var titleLen = meta.title ? meta.title.length : 0;
  var titleBadge = !meta.title ? ['fail', '✗ Afwezig'] : titleLen < 30 ? ['warn', '⚠ Te kort'] : titleLen > 60 ? ['warn', '⚠ Te lang'] : ['pass', '✓ OK'];
  html += metaRow('Paginatitel (' + titleLen + ' tekens)', titleBadge[0], titleBadge[1], meta.title);

  // Meta description
  var descLen = meta.desc ? meta.desc.length : 0;
  var descBadge = !meta.desc ? ['fail', '✗ Afwezig'] : descLen < 70 ? ['warn', '⚠ Te kort'] : descLen > 155 ? ['warn', '⚠ Te lang'] : ['pass', '✓ OK'];
  html += metaRow('Meta description (' + descLen + ' tekens)', descBadge[0], descBadge[1], meta.desc);

  // og:title
  html += metaRow('og:title', meta.ogTitle ? 'pass' : 'warn', meta.ogTitle ? '✓ OK' : '⚠ Afwezig', meta.ogTitle);

  // og:description
  html += metaRow('og:description', meta.ogDesc ? 'pass' : 'warn', meta.ogDesc ? '✓ OK' : '⚠ Afwezig', meta.ogDesc);

  // og:image
  html += metaRow('og:image', meta.ogImage ? 'pass' : 'warn', meta.ogImage ? '✓ OK' : '⚠ Afwezig', meta.ogImage);

  // Canonical
  html += metaRow('Canonical URL', meta.canonical ? 'info' : 'info', meta.canonical ? 'ℹ Aanwezig' : 'ℹ Afwezig', meta.canonical);

  // Viewport
  var vpOk = meta.viewport && meta.viewport.includes('width=device-width');
  html += metaRow('Viewport', vpOk ? 'pass' : 'fail', vpOk ? '✓ OK' : '✗ Onjuist', meta.viewport);

  // Robots
  var robotsNoindex = meta.robots && /noindex/i.test(meta.robots);
  html += metaRow('Robots', robotsNoindex ? 'warn' : (meta.robots ? 'pass' : 'info'), robotsNoindex ? '⚠ noindex!' : (meta.robots ? '✓ OK' : 'ℹ Standaard'), meta.robots);

  // Favicon
  html += metaRow('Favicon', meta.favicon ? 'pass' : 'warn', meta.favicon ? '✓ Aanwezig' : '⚠ Afwezig', meta.favicon ? 'Favicon gevonden' : null);

  // Theme color
  html += metaRow('Theme color', meta.themeColor ? 'info' : 'info', meta.themeColor ? 'ℹ Aanwezig' : 'ℹ Afwezig', meta.themeColor);

  container.innerHTML = html;
}

// ── Link Checker ────────────────────────────────────────────────────────────

let allLinks = [];
let checkingActive = false;

function initLinks(links) {
  allLinks = links;
  document.getElementById('links-loading').style.display = 'none';
  const content = document.getElementById('links-content');
  content.style.display = 'block';

  content.innerHTML =
    '<div class="link-controls">' +
      '<button class="btn btn-primary" id="btn-check-links">▶ Start linkcheck</button>' +
      '<span style="font-size:12px;color:#6b7280">' + links.length + ' links gevonden</span>' +
    '</div>' +
    '<div id="links-progress-wrap" style="display:none">' +
      '<div class="progress-bar-wrap"><div class="progress-bar" id="links-progress-bar"></div></div>' +
      '<div class="progress-label" id="links-progress-label"></div>' +
    '</div>' +
    '<div id="links-results"></div>';

  document.getElementById('btn-check-links').addEventListener('click', startLinkCheck);
}

async function startLinkCheck() {
  if (checkingActive) return;
  checkingActive = true;

  const btn = document.getElementById('btn-check-links');
  btn.disabled = true;
  btn.textContent = '⏳ Bezig…';

  const progressWrap = document.getElementById('links-progress-wrap');
  const progressBar = document.getElementById('links-progress-bar');
  const progressLabel = document.getElementById('links-progress-label');
  const resultsEl = document.getElementById('links-results');
  progressWrap.style.display = 'block';
  resultsEl.innerHTML = '';

  const httpLinks = allLinks.filter(function(l) {
    return l.url.startsWith('http://') || l.url.startsWith('https://');
  });
  const skipped = allLinks.length - httpLinks.length;
  const results = [];
  const CONCURRENCY = 5;
  let completed = 0;

  function updateProgress() {
    const pct = httpLinks.length > 0 ? Math.round((completed / httpLinks.length) * 100) : 100;
    progressBar.style.width = pct + '%';
    progressLabel.textContent = completed + ' / ' + httpLinks.length + ' gecontroleerd…';
  }

  for (let i = 0; i < httpLinks.length; i += CONCURRENCY) {
    const batch = httpLinks.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(function(link) {
      return chrome.runtime.sendMessage({ action: 'checkLink', url: link.url })
        .then(function(res) { return Object.assign({}, res, { linkText: link.text, type: link.type }); })
        .catch(function(err) { return { url: link.url, status: 0, ok: false, error: err.message, linkText: link.text, type: link.type }; });
    }));
    results.push.apply(results, batchResults);
    completed += batch.length;
    updateProgress();
  }

  checkingActive = false;
  btn.disabled = false;
  btn.textContent = '↺ Opnieuw checken';
  btn.onclick = function() { results.length = 0; startLinkCheck(); };
  progressLabel.textContent = 'Klaar — ' + httpLinks.length + ' links gecontroleerd' + (skipped > 0 ? ', ' + skipped + ' overgeslagen (niet-HTTP)' : '') + '.';

  renderLinkResults(results, resultsEl);
}

function renderLinkResults(results, container) {
  const broken = results.filter(function(r) { return r.status >= 400 || (!r.ok && r.status === 0); });
  const redirects = results.filter(function(r) { return r.status >= 300 && r.status < 400; });
  const ok = results.filter(function(r) { return r.status >= 200 && r.status < 300; });

  let html = '<div class="link-summary">';
  html += '<div class="link-summary-item" style="background:#fee2e2;color:#dc2626">✗ ' + broken.length + ' gebroken</div>';
  html += '<div class="link-summary-item" style="background:#fef3c7;color:#d97706">→ ' + redirects.length + ' redirect</div>';
  html += '<div class="link-summary-item" style="background:#dcfce7;color:#16a34a">✓ ' + ok.length + ' OK</div>';
  html += '</div>';

  if (broken.length > 0) {
    html += '<div class="link-group-header broken">✗ Gebroken links (' + broken.length + ')</div>';
    broken.forEach(function(r) { html += linkItemHtml(r, 'broken'); });
  }
  if (redirects.length > 0) {
    html += '<div class="link-group-header redirect">→ Redirects (' + redirects.length + ')</div>';
    redirects.forEach(function(r) { html += linkItemHtml(r, 'redirect'); });
  }
  if (ok.length > 0) {
    html += '<div class="link-group-header ok">✓ OK (' + ok.length + ')</div>';
    ok.forEach(function(r) { html += linkItemHtml(r, 'ok'); });
  }

  container.innerHTML = html;
}

function linkItemHtml(r, cssClass) {
  const code = r.status > 0 ? r.status : (r.error ? 'ERR' : '?');
  const displayUrl = r.url.length > 55 ? r.url.substring(0, 52) + '…' : r.url;
  const errorNote = r.error ? ' — ' + escHtml(r.error) : '';
  const redirectNote = r.finalUrl ? ' → ' + escHtml(r.finalUrl.substring(0, 35)) : '';
  const hasLgc = r.lgcId ? true : false;
  return '<div class="link-item' + (hasLgc ? ' clickable' : '') + '"' +
    (hasLgc ? ' data-lgc="' + escHtml(r.lgcId) + '" title="Klik om naar dit element te springen"' : '') + '>' +
    '<span class="link-status-code ' + cssClass + '">' + code + '</span>' +
    '<span class="link-url" title="' + escHtml(r.url) + '">' + escHtml(displayUrl) + errorNote + redirectNote + '</span>' +
    (hasLgc ? '<span class="jump-hint">↗</span>' : '') +
    '</div>';
}

// ── Scroll-to-element ────────────────────────────────────────────────────────

async function scrollToElement(lgcId) {
  if (!lgcId) return;
  const tab = await getActiveTab();
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: function(id) {
      const el = document.querySelector('[data-lgc-id="' + id + '"]');
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.outline = '3px solid #40c97f';
      el.style.outlineOffset = '4px';
      el.style.transition = 'outline 0.3s';
      setTimeout(function() {
        el.style.outline = '';
        el.style.outlineOffset = '';
        el.style.transition = '';
      }, 2500);
    },
    args: [lgcId]
  });
}

// ── Global click delegation for [data-lgc] items ─────────────────────────────

document.addEventListener('click', function(e) {
  const target = e.target.closest('[data-lgc]');
  if (target && target.dataset.lgc) {
    e.stopPropagation();
    scrollToElement(target.dataset.lgc);
  }
});

// ── Utility ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lgcAttr(lgcId) {
  return lgcId ? ' class="clickable" data-lgc="' + escHtml(lgcId) + '" title="Klik om naar dit element te springen"' : '';
}

// ── Page check function (injected into the page via chrome.scripting) ────────

function runPageChecks() {
  // Assign unique IDs to elements so popup can scroll to them
  var _lgcCounter = 0;
  function assignId(el) {
    var id = 'lgc-' + (_lgcCounter++);
    el.setAttribute('data-lgc-id', id);
    return id;
  }
  function item(text, el) {
    return { text: text, lgcId: el ? assignId(el) : null };
  }

  function collectHeadings() {
    // Build a combined selector: semantic h-tags + class-based (h1..h6) + ARIA headings
    const classSelectors = [1,2,3,4,5,6].map(function(n) { return '[class~="h' + n + '"]'; }).join(',');
    const combined = 'h1,h2,h3,h4,h5,h6,' + classSelectors + ',[role="heading"]';

    function getHeadingInfo(el) {
      const tag = el.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        return { level: parseInt(tag[1]), source: 'tag' };
      }
      if (el.getAttribute('role') === 'heading') {
        const lvl = parseInt(el.getAttribute('aria-level')) || 2;
        return { level: lvl, source: 'aria' };
      }
      for (var i = 1; i <= 6; i++) {
        if (el.classList.contains('h' + i)) return { level: i, source: 'class' };
      }
      return null;
    }

    const seen = new WeakSet();
    const headings = [];
    document.querySelectorAll(combined).forEach(function(el) {
      if (seen.has(el)) return;
      seen.add(el);
      // Skip elements nested inside a real h-tag (e.g. span inside h2)
      if (el.closest('h1,h2,h3,h4,h5,h6') && !/^h[1-6]$/.test(el.tagName.toLowerCase())) return;
      const info = getHeadingInfo(el);
      if (!info) return;
      const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ') || '[leeg]';
      headings.push({ level: info.level, source: info.source, text: text, lgcId: assignId(el) });
    });
    return headings;
  }

  function collectLinks() {
    const seen = new Set();
    const links = [];
    document.querySelectorAll('a[href]').forEach(function(el) {
      const href = el.href;
      if (href && !seen.has(href)) {
        seen.add(href);
        links.push({ url: href, text: (el.innerText || el.getAttribute('aria-label') || '').trim().substring(0, 80), type: 'anchor', lgcId: assignId(el) });
      }
    });
    document.querySelectorAll('img[src]').forEach(function(el) {
      const src = el.src;
      if (src && !seen.has(src) && (src.startsWith('http://') || src.startsWith('https://'))) {
        seen.add(src);
        links.push({ url: src, text: el.alt || '[afbeelding]', type: 'img', lgcId: assignId(el) });
      }
    });
    return links;
  }

  function hexToRgb(color) {
    const rgba = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return rgba ? { r: +rgba[1], g: +rgba[2], b: +rgba[3] } : null;
  }

  function relativeLuminance(r, g, b) {
    const vals = [r / 255, g / 255, b / 255].map(function(c) {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2];
  }

  function contrastRatio(a, b) {
    const l1 = relativeLuminance(a.r, a.g, a.b);
    const l2 = relativeLuminance(b.r, b.g, b.b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  function getInputLabel(inp) {
    if (inp.id) {
      const lbl = document.querySelector('label[for="' + inp.id + '"]');
      if (lbl && lbl.innerText.trim()) return true;
    }
    if (inp.closest('label')) return true;
    if (inp.getAttribute('aria-label') && inp.getAttribute('aria-label').trim()) return true;
    const lbId = inp.getAttribute('aria-labelledby');
    if (lbId) {
      const lbEl = document.getElementById(lbId);
      if (lbEl && lbEl.innerText.trim()) return true;
    }
    if (inp.getAttribute('title') && inp.getAttribute('title').trim()) return true;
    return false;
  }

  function runWcagChecks() {
    const res = {};

    function elDesc(el) {
      var tag = el.tagName.toLowerCase();
      var id = el.id ? '#' + el.id : '';
      var cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '';
      var name = el.getAttribute('name') ? ' name="' + el.getAttribute('name') + '"' : '';
      var type = el.getAttribute('type') ? ' type="' + el.getAttribute('type') + '"' : '';
      return '<' + tag + id + cls + name + type + '>';
    }

    // 1.1.1 Alt-teksten
    const imgs = Array.from(document.querySelectorAll('img'));
    const missingAlt = imgs.filter(function(img) { return !img.hasAttribute('alt'); });
    const emptyAlt = imgs.filter(function(img) { return img.hasAttribute('alt') && img.getAttribute('alt').trim() === ''; });
    res['1.1.1'] = {
      status: missingAlt.length === 0 ? 'pass' : 'fail',
      detail: missingAlt.length === 0
        ? 'Alle ' + imgs.length + ' afbeeldingen hebben een alt-attribuut (' + emptyAlt.length + ' leeg/decoratief).'
        : missingAlt.length + ' van ' + imgs.length + ' afbeeldingen missen het alt-attribuut.',
      items: missingAlt.slice(0, 15).map(function(img) {
        var src = (img.getAttribute('src') || '').split('/').pop().substring(0, 60) || '(geen src)';
        return item('Afbeelding zonder alt: ' + src, img);
      })
    };

    // 1.3.1 Labels
    const inputs = Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]),select,textarea'));
    const noLabel = inputs.filter(function(inp) { return !getInputLabel(inp); });
    res['1.3.1'] = {
      status: noLabel.length === 0 ? 'pass' : 'fail',
      detail: noLabel.length === 0
        ? 'Alle ' + inputs.length + ' formuliervelden hebben een label.'
        : noLabel.length + ' van ' + inputs.length + ' formuliervelden missen een label.',
      items: noLabel.slice(0, 15).map(function(inp) { return item('Geen label: ' + elDesc(inp), inp); })
    };

    // 1.4.3 Contrast
    let contrastIssues = 0, contrastChecked = 0;
    const contrastProblems = [];
    Array.from(document.querySelectorAll('p,span,a,li,td,th,h1,h2,h3,h4,h5,h6,label,button')).slice(0, 100).forEach(function(el) {
      if (!el.innerText || !el.innerText.trim()) return;
      const s = getComputedStyle(el);
      if (s.backgroundColor === 'rgba(0, 0, 0, 0)' || s.backgroundColor === 'transparent') return;
      const fg = hexToRgb(s.color), bg = hexToRgb(s.backgroundColor);
      if (!fg || !bg) return;
      contrastChecked++;
      const ratio = contrastRatio(fg, bg);
      const fs = parseFloat(s.fontSize);
      const large = fs >= 18 || (parseInt(s.fontWeight) >= 700 && fs >= 14);
      if (ratio < (large ? 3 : 4.5)) {
        contrastIssues++;
        if (contrastProblems.length < 10) {
          contrastProblems.push(
            item(elDesc(el) + ' contrast ' + ratio.toFixed(1) + ':1 (min. ' + (large ? 3 : 4.5) + ':1) — "' + el.innerText.trim().substring(0, 40) + '"', el)
          );
        }
      }
    });
    res['1.4.3'] = {
      status: contrastIssues === 0 ? 'pass' : 'warn',
      detail: contrastIssues === 0
        ? 'Geen contrastproblemen in ' + contrastChecked + ' gecontroleerde elementen.'
        : contrastIssues + ' mogelijke contrastproblemen in ' + contrastChecked + ' elementen.',
      items: contrastProblems
    };

    // 1.4.4 Tekstgrootte
    let smallText = 0;
    const smallTextItems = [];
    Array.from(document.querySelectorAll('p,span,a,li,td,h1,h2,h3,h4,h5,h6,label,button')).slice(0, 200).forEach(function(el) {
      if (!el.innerText || !el.innerText.trim()) return;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 12) {
        smallText++;
        if (smallTextItems.length < 10) smallTextItems.push(item(elDesc(el) + ' — ' + fs + 'px: "' + el.innerText.trim().substring(0, 40) + '"', el));
      }
    });
    res['1.4.4'] = {
      status: smallText === 0 ? 'pass' : 'fail',
      detail: smallText === 0 ? 'Geen tekstelementen kleiner dan 12px gevonden.' : smallText + ' elementen hebben tekst kleiner dan 12px.',
      items: smallTextItems
    };

    // 1.4.5 Afbeeldingen zonder afmetingen + broken
    const allImgsForDims = Array.from(document.querySelectorAll('img'));
    const noDims = allImgsForDims.filter(function(img) { return !img.getAttribute('width') || !img.getAttribute('height'); });
    const brokenImgs = allImgsForDims.filter(function(img) { return img.complete && img.naturalWidth === 0 && img.getAttribute('src'); });
    const imgItems = [];
    noDims.slice(0, 8).forEach(function(img) { imgItems.push(item('Geen width/height: ' + (img.getAttribute('src') || '').split('/').pop().substring(0, 50), img)); });
    brokenImgs.slice(0, 8).forEach(function(img) { imgItems.push(item('Laadt niet: ' + (img.getAttribute('src') || '').split('/').pop().substring(0, 50), img)); });
    res['1.4.5'] = {
      status: (noDims.length === 0 && brokenImgs.length === 0) ? 'pass' : (brokenImgs.length > 0 ? 'fail' : 'warn'),
      detail: (noDims.length === 0 && brokenImgs.length === 0) ? 'Alle afbeeldingen hebben afmetingen en laden correct.' : brokenImgs.length + ' afbeelding(en) laden niet, ' + noDims.length + ' missen width/height.',
      items: imgItems
    };

    // 2.1.1 Focusindicator
    const interactive = Array.from(document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]'));
    const noFocusItems = [];
    interactive.slice(0, 50).forEach(function(el) {
      const s = getComputedStyle(el);
      if (s.outlineWidth === '0px' || s.outlineStyle === 'none') {
        if (noFocusItems.length < 10) noFocusItems.push(item('Geen zichtbare focus: ' + elDesc(el), el));
      }
    });
    res['2.1.1'] = {
      status: noFocusItems.length === 0 ? 'pass' : 'warn',
      detail: noFocusItems.length === 0
        ? 'Geen elementen met outline:none (' + interactive.length + ' interactieve elementen).'
        : noFocusItems.length + ' interactieve elementen hebben mogelijk geen zichtbare focusindicator.',
      items: noFocusItems
    };

    // 2.4.1 Blokken omzeilen
    const hasSkip = !!document.querySelector('a[href^="#"]');
    const hasMain = !!document.querySelector('main,[role=main]');
    const hasNav = !!document.querySelector('nav,[role=navigation]');
    const hasHeader = !!document.querySelector('header,[role=banner]');
    const landmarks = [hasMain && '<main>', hasNav && '<nav>', hasHeader && '<header>'].filter(Boolean);
    const missing241 = [!hasMain && '<main>', !hasNav && '<nav>', !hasHeader && '<header>'].filter(Boolean);
    res['2.4.1'] = {
      status: hasSkip || landmarks.length >= 2 ? 'pass' : 'warn',
      detail: hasSkip ? 'Skiplink aanwezig.' : 'Landmarks gevonden: ' + (landmarks.join(', ') || 'geen') + '.',
      items: !hasSkip && missing241.length > 0 ? missing241.map(function(m) { return item('Ontbreekt: ' + m + ' landmark', null); }) : []
    };

    // 2.4.2 Paginatitel
    const title = document.title.trim();
    res['2.4.2'] = {
      status: title ? 'pass' : 'fail',
      detail: title ? 'Paginatitel: "' + title + '".' : 'Pagina heeft geen titel (<title> leeg of afwezig).',
      items: []
    };

    // 2.4.4 target=_blank zonder rel=noopener + PDF-links
    const blankLinks = Array.from(document.querySelectorAll('a[target="_blank"]'));
    const unsafeBlank = blankLinks.filter(function(a) {
      const rel = (a.getAttribute('rel') || '');
      return !rel.includes('noopener') && !rel.includes('noreferrer');
    });
    const docPattern = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip)(\?|#|$)/i;
    const docLinks = Array.from(document.querySelectorAll('a[href]')).filter(function(a) {
      if (!docPattern.test(a.getAttribute('href') || '')) return false;
      const text = ((a.innerText || '') + (a.getAttribute('aria-label') || '') + (a.getAttribute('title') || '')).toLowerCase();
      return !/(pdf|doc|word|excel|download|zip)/i.test(text);
    });
    const items244 = [];
    unsafeBlank.slice(0, 8).forEach(function(a) { items244.push(item('target=_blank zonder rel=noopener: ' + ((a.innerText || '').trim().substring(0, 40) || a.href.substring(0, 40)), a)); });
    docLinks.slice(0, 8).forEach(function(a) { items244.push(item('Documentlink zonder bestandstype: ' + (a.getAttribute('href') || '').split('/').pop().substring(0, 50), a)); });
    res['2.4.4'] = {
      status: items244.length === 0 ? 'pass' : 'fail',
      detail: items244.length === 0 ? 'Geen linkdoel-problemen gevonden.' : unsafeBlank.length + ' onveilige externe link(s), ' + docLinks.length + ' documentlink(s) zonder aanduiding.',
      items: items244
    };

    // 2.4.6 Koppen
    const hCount = document.querySelectorAll('h1,h2,h3,h4,h5,h6').length;
    res['2.4.6'] = {
      status: hCount > 0 ? 'pass' : 'fail',
      detail: hCount > 0 ? hCount + ' kopelementen gevonden.' : 'Geen kopelementen (h1-h6) gevonden.',
      items: []
    };

    // 3.1.1 Taal
    const lang = document.documentElement.getAttribute('lang');
    res['3.1.1'] = {
      status: lang && lang.trim() ? 'pass' : 'fail',
      detail: lang ? 'lang="' + lang + '" op <html>.' : '<html> mist het lang-attribuut.',
      items: !lang ? [item('Voeg lang="nl" (of andere taalcode) toe aan de <html> tag.', null)] : []
    };

    // 3.3.2 Verplichte velden
    const req = Array.from(document.querySelectorAll('input[required],select[required],textarea[required]'));
    const reqNoLabel = req.filter(function(inp) { return !getInputLabel(inp); });
    res['3.3.2'] = {
      status: reqNoLabel.length === 0 ? 'pass' : 'fail',
      detail: req.length === 0
        ? 'Geen verplichte formuliervelden gevonden.'
        : reqNoLabel.length === 0
          ? 'Alle ' + req.length + ' verplichte velden hebben een label.'
          : reqNoLabel.length + ' van ' + req.length + ' verplichte velden missen een label.',
      items: reqNoLabel.slice(0, 10).map(function(inp) { return item('Geen label: ' + elDesc(inp), inp); })
    };

    // 3.3.4 Formulieren
    const forms = Array.from(document.querySelectorAll('form'));
    const formItems = [];
    forms.forEach(function(form) {
      const hasSubmit = !!form.querySelector('button[type="submit"],input[type="submit"],button:not([type="button"]):not([type="reset"])');
      const noAction = !form.getAttribute('action') && !form.getAttribute('novalidate');
      if (!hasSubmit) formItems.push(item('Formulier zonder submit-knop: ' + elDesc(form), form));
      if (noAction) formItems.push(item('Formulier zonder action-attribuut: ' + elDesc(form), form));
    });
    res['3.3.4'] = {
      status: formItems.length === 0 ? 'pass' : 'warn',
      detail: forms.length === 0 ? 'Geen formulieren gevonden.' : formItems.length === 0 ? 'Alle ' + forms.length + ' formulieren zijn compleet.' : formItems.length + ' formulierprobleem/problemen gevonden.',
      items: formItems
    };

    // 4.1.1 Parsing – Duplicate IDs
    const allIdEls = Array.from(document.querySelectorAll('[id]'));
    const idCounts = {};
    allIdEls.forEach(function(el) { idCounts[el.id] = (idCounts[el.id] || 0) + 1; });
    const dupIds = Object.keys(idCounts).filter(function(id) { return idCounts[id] > 1; });
    const dupItems = [];
    dupIds.slice(0, 10).forEach(function(id) {
      Array.from(document.querySelectorAll('[id="' + id + '"]')).slice(0, 3).forEach(function(el) {
        dupItems.push(item('Duplicate id="' + id + '": ' + elDesc(el), el));
      });
    });
    res['4.1.1'] = {
      status: dupIds.length === 0 ? 'pass' : 'fail',
      detail: dupIds.length === 0 ? 'Geen duplicate ID\'s gevonden.' : dupIds.length + ' duplicate ID-waarde(n) gevonden.',
      items: dupItems
    };

    // 4.1.2 Naam, rol, waarde
    const btns = Array.from(document.querySelectorAll('button,[role=button]'));
    const emptyBtns = btns.filter(function(b) {
      const lbId = b.getAttribute('aria-labelledby');
      if (lbId) { const el = document.getElementById(lbId); if (el && el.innerText.trim()) return false; }
      return !(b.innerText && b.innerText.trim()) && !(b.getAttribute('aria-label') && b.getAttribute('aria-label').trim()) && !(b.getAttribute('title') && b.getAttribute('title').trim());
    });
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const emptyLinks = anchors.filter(function(a) {
      return !(a.innerText && a.innerText.trim()) && !(a.getAttribute('aria-label') && a.getAttribute('aria-label').trim()) && !(a.getAttribute('title') && a.getAttribute('title').trim()) && !a.querySelector('img[alt]');
    });
    const issues412 = emptyBtns.length + emptyLinks.length;
    const items412 = [];
    emptyBtns.slice(0, 8).forEach(function(b) { items412.push(item('Lege knop: ' + elDesc(b), b)); });
    emptyLinks.slice(0, 8).forEach(function(a) { items412.push(item('Lege link: ' + (a.getAttribute('href') || '').substring(0, 60), a)); });
    res['4.1.2'] = {
      status: issues412 === 0 ? 'pass' : 'fail',
      detail: issues412 === 0
        ? 'Alle ' + btns.length + ' knoppen en ' + anchors.length + ' links hebben toegankelijke namen.'
        : emptyBtns.length + ' lege knop(pen) en ' + emptyLinks.length + ' lege link(s) gevonden.',
      items: items412
    };

    return res;
  }

  function collectMeta() {
    function getMetaContent(selector) {
      var el = document.querySelector(selector);
      return el ? el.getAttribute('content') : null;
    }
    function getMetaHref(selector) {
      var el = document.querySelector(selector);
      return el ? (el.href || el.getAttribute('href')) : null;
    }
    var title = document.title.trim();
    var desc = getMetaContent('meta[name="description"]');
    var ogTitle = getMetaContent('meta[property="og:title"]');
    var ogDesc = getMetaContent('meta[property="og:description"]');
    var ogImage = getMetaContent('meta[property="og:image"]');
    var canonical = getMetaHref('link[rel="canonical"]');
    var viewport = getMetaContent('meta[name="viewport"]');
    var robots = getMetaContent('meta[name="robots"]');
    var favicon = !!document.querySelector('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]');
    var themeColor = getMetaContent('meta[name="theme-color"]');
    return { title, desc, ogTitle, ogDesc, ogImage, canonical, viewport, robots, favicon, themeColor, url: location.href };
  }

  return {
    headings: collectHeadings(),
    wcag: runWcagChecks(),
    links: collectLinks(),
    meta: collectMeta()
  };
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

runChecks();
