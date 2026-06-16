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
    return;
  }

  if (!results) {
    const msg = 'Geen resultaten ontvangen van de pagina.';
    showError('headings-content', 'headings-loading', msg);
    showError('wcag-content', 'wcag-loading', msg);
    showLinksError(msg);
    return;
  }

  renderHeadings(results.headings);
  renderWcag(results.wcag);
  initLinks(results.links);
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
        issue.items.forEach(function(item) { html += '<li>' + escHtml(item) + '</li>'; });
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
      html += '<div class="heading-item' + (isJump ? ' issue' : '') + '" style="padding-left:' + (indent + 6) + 'px">';
      html += '<span class="heading-badge h' + h.level + '-badge">h' + h.level + '</span>';
      if (h.source === 'class') html += '<span class="heading-source-badge">class</span>';
      if (h.source === 'aria') html += '<span class="heading-source-badge aria">aria</span>';
      html += '<span class="heading-text" title="' + escHtml(h.text) + '">' + escHtml(h.text) + '</span>';
      if (isJump) html += '<span class="badge warn" style="margin-left:auto;font-size:10px;flex-shrink:0">⚠ overgeslagen</span>';
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
      items: h1s.map(function(h) { return '"' + h.text + '"' + (h.source !== 'tag' ? ' (via ' + h.source + ')' : ''); })
    });
  }

  let prevLevel = 0;
  let prevText = '';
  headings.forEach(function(h) {
    if (prevLevel > 0 && h.level > prevLevel + 1) {
      issues.push({
        type: 'warning', icon: '⚠',
        message: 'Kopniveau overgeslagen: H' + prevLevel + ' → H' + h.level + ' (niveau H' + (prevLevel + 1) + ' ontbreekt).',
        items: [
          'Vorig kop (H' + prevLevel + '): "' + prevText + '"',
          'Volgend kop (H' + h.level + '): "' + h.text + '"'
        ]
      });
    }
    prevLevel = h.level;
    prevText = h.text;
  });

  // Check if heading order is correct (h1 must be first heading)
  if (headings.length > 0 && headings[0].level !== 1 && h1s.length > 0) {
    issues.push({
      type: 'warning', icon: '⚠',
      message: 'De eerste kop op de pagina is geen H1 maar een H' + headings[0].level + '.',
      items: ['Eerste kop: "' + headings[0].text + '" (H' + headings[0].level + ')']
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
  '2.1.1': { name: 'Toetsenbord', group: 'Bedienbaar' },
  '2.4.1': { name: 'Blokken omzeilen', group: 'Bedienbaar' },
  '2.4.2': { name: 'Paginatitel', group: 'Bedienbaar' },
  '2.4.6': { name: 'Koppen en labels', group: 'Bedienbaar' },
  '3.1.1': { name: 'Taal van pagina', group: 'Begrijpelijk' },
  '3.3.2': { name: 'Labels of instructies', group: 'Begrijpelijk' },
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
        item.result.items.forEach(function(it) { html += '<li>' + escHtml(it) + '</li>'; });
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
  const displayUrl = r.url.length > 60 ? r.url.substring(0, 57) + '…' : r.url;
  const errorNote = r.error ? ' — ' + escHtml(r.error) : '';
  const redirectNote = r.finalUrl ? ' → ' + escHtml(r.finalUrl.substring(0, 40)) : '';
  return '<div class="link-item">' +
    '<span class="link-status-code ' + cssClass + '">' + code + '</span>' +
    '<span class="link-url" title="' + escHtml(r.url) + '">' + escHtml(displayUrl) + errorNote + redirectNote + '</span>' +
    '</div>';
}

// ── Utility ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Page check function (injected into the page via chrome.scripting) ────────

function runPageChecks() {
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
      headings.push({ level: info.level, source: info.source, text: text });
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
        links.push({ url: href, text: (el.innerText || el.getAttribute('aria-label') || '').trim().substring(0, 80), type: 'anchor' });
      }
    });
    document.querySelectorAll('img[src]').forEach(function(el) {
      const src = el.src;
      if (src && !seen.has(src) && (src.startsWith('http://') || src.startsWith('https://'))) {
        seen.add(src);
        links.push({ url: src, text: el.alt || '[afbeelding]', type: 'img' });
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
        return 'Afbeelding zonder alt: ' + src;
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
      items: noLabel.slice(0, 15).map(function(inp) { return 'Geen label: ' + elDesc(inp); })
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
            elDesc(el) + ' contrast ' + ratio.toFixed(1) + ':1 (min. ' + (large ? 3 : 4.5) + ':1) — "' + el.innerText.trim().substring(0, 40) + '"'
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
        if (smallTextItems.length < 10) smallTextItems.push(elDesc(el) + ' — ' + fs + 'px: "' + el.innerText.trim().substring(0, 40) + '"');
      }
    });
    res['1.4.4'] = {
      status: smallText === 0 ? 'pass' : 'fail',
      detail: smallText === 0 ? 'Geen tekstelementen kleiner dan 12px gevonden.' : smallText + ' elementen hebben tekst kleiner dan 12px.',
      items: smallTextItems
    };

    // 2.1.1 Focusindicator
    const interactive = Array.from(document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]'));
    const noFocusItems = [];
    interactive.slice(0, 50).forEach(function(el) {
      const s = getComputedStyle(el);
      if (s.outlineWidth === '0px' || s.outlineStyle === 'none') {
        if (noFocusItems.length < 10) noFocusItems.push(elDesc(el));
      }
    });
    res['2.1.1'] = {
      status: noFocusItems.length === 0 ? 'pass' : 'warn',
      detail: noFocusItems.length === 0
        ? 'Geen elementen met outline:none (' + interactive.length + ' interactieve elementen).'
        : noFocusItems.length + ' interactieve elementen hebben mogelijk geen zichtbare focusindicator.',
      items: noFocusItems.map(function(d) { return 'Geen zichtbare focus: ' + d; })
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
      items: !hasSkip && missing241.length > 0 ? missing241.map(function(m) { return 'Ontbreekt: ' + m + ' landmark'; }) : []
    };

    // 2.4.2 Paginatitel
    const title = document.title.trim();
    res['2.4.2'] = {
      status: title ? 'pass' : 'fail',
      detail: title ? 'Paginatitel: "' + title + '".' : 'Pagina heeft geen titel (<title> leeg of afwezig).',
      items: []
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
      items: !lang ? ['Voeg lang="nl" (of andere taalcode) toe aan de <html> tag.'] : []
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
      items: reqNoLabel.slice(0, 10).map(function(inp) { return 'Geen label: ' + elDesc(inp); })
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
    emptyBtns.slice(0, 8).forEach(function(b) { items412.push('Lege knop: ' + elDesc(b)); });
    emptyLinks.slice(0, 8).forEach(function(a) { items412.push('Lege link: ' + (a.getAttribute('href') || '').substring(0, 60)); });
    res['4.1.2'] = {
      status: issues412 === 0 ? 'pass' : 'fail',
      detail: issues412 === 0
        ? 'Alle ' + btns.length + ' knoppen en ' + anchors.length + ' links hebben toegankelijke namen.'
        : emptyBtns.length + ' lege knop(pen) en ' + emptyLinks.length + ' lege link(s) gevonden.',
      items: items412
    };

    return res;
  }

  return {
    headings: collectHeadings(),
    wcag: runWcagChecks(),
    links: collectLinks()
  };
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

runChecks();
