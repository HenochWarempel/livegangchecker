// Content script for LiveGang Checker
// Collects page data: headings, WCAG checks, links

(function () {
  'use strict';

  // ── Headings ──────────────────────────────────────────────────────────────
  function collectHeadings() {
    const headings = [];
    document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
      headings.push({
        level: parseInt(el.tagName[1]),
        text: el.innerText.trim() || '[leeg]',
        id: el.id || null
      });
    });
    return headings;
  }

  // ── Links ──────────────────────────────────────────────────────────────────
  function collectLinks() {
    const seen = new Set();
    const links = [];

    document.querySelectorAll('a[href]').forEach(el => {
      const href = el.href;
      if (href && !seen.has(href)) {
        seen.add(href);
        links.push({
          url: href,
          text: (el.innerText || el.getAttribute('aria-label') || '').trim().substring(0, 80),
          type: 'anchor'
        });
      }
    });

    document.querySelectorAll('img[src]').forEach(el => {
      const src = el.src;
      if (src && !seen.has(src)) {
        seen.add(src);
        links.push({
          url: src,
          text: el.alt || '[afbeelding]',
          type: 'img'
        });
      }
    });

    return links;
  }

  // ── WCAG Helpers ───────────────────────────────────────────────────────────

  function hexToRgb(color) {
    // Parse rgb/rgba strings
    const rgba = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgba) return { r: +rgba[1], g: +rgba[2], b: +rgba[3] };
    return null;
  }

  function relativeLuminance(r, g, b) {
    const srgb = [r, g, b].map(c => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  }

  function contrastRatio(rgb1, rgb2) {
    const l1 = relativeLuminance(rgb1.r, rgb1.g, rgb1.b);
    const l2 = relativeLuminance(rgb2.r, rgb2.g, rgb2.b);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function getInputLabel(input) {
    // Check for associated label via for/id
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label && label.innerText.trim()) return true;
    }
    // Check for wrapping label
    if (input.closest('label')) return true;
    // Check aria-label
    if (input.getAttribute('aria-label') && input.getAttribute('aria-label').trim()) return true;
    // Check aria-labelledby
    const labelledby = input.getAttribute('aria-labelledby');
    if (labelledby) {
      const labelEl = document.getElementById(labelledby);
      if (labelEl && labelEl.innerText.trim()) return true;
    }
    // Check title
    if (input.getAttribute('title') && input.getAttribute('title').trim()) return true;
    return false;
  }

  // ── WCAG Checks ───────────────────────────────────────────────────────────
  function runWcagChecks() {
    const results = {};

    // 1.1.1 Alt-teksten
    const allImgs = Array.from(document.querySelectorAll('img'));
    const imgsWithoutAlt = allImgs.filter(img =>
      !img.hasAttribute('alt') || img.getAttribute('alt').trim() === '' && !img.getAttribute('role') === 'presentation'
    );
    // More nuanced: decorative images with empty alt are OK
    const imgsActuallyMissingAlt = allImgs.filter(img => !img.hasAttribute('alt'));
    const imgsEmptyAlt = allImgs.filter(img => img.hasAttribute('alt') && img.getAttribute('alt').trim() === '');
    results['1.1.1'] = {
      status: imgsActuallyMissingAlt.length === 0 ? 'pass' : 'fail',
      total: allImgs.length,
      missing: imgsActuallyMissingAlt.length,
      empty: imgsEmptyAlt.length,
      detail: imgsActuallyMissingAlt.length === 0
        ? `Alle ${allImgs.length} afbeeldingen hebben een alt-attribuut (${imgsEmptyAlt.length} leeg/decoratief).`
        : `${imgsActuallyMissingAlt.length} van ${allImgs.length} afbeeldingen missen het alt-attribuut.`
    };

    // 1.3.1 Info en relaties – form inputs hebben labels
    const formInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'));
    const inputsWithoutLabel = formInputs.filter(inp => !getInputLabel(inp));
    results['1.3.1'] = {
      status: inputsWithoutLabel.length === 0 ? 'pass' : 'fail',
      total: formInputs.length,
      missing: inputsWithoutLabel.length,
      detail: inputsWithoutLabel.length === 0
        ? `Alle ${formInputs.length} formuliervelden hebben een label.`
        : `${inputsWithoutLabel.length} van ${formInputs.length} formuliervelden missen een label.`
    };

    // 1.4.3 Contrast – sample visible text elements
    let contrastIssues = 0;
    let contrastChecked = 0;
    const textEls = Array.from(document.querySelectorAll('p, span, a, li, td, th, h1, h2, h3, h4, h5, h6, label, button')).slice(0, 100);
    textEls.forEach(el => {
      if (!el.innerText || !el.innerText.trim()) return;
      const style = getComputedStyle(el);
      const fgRgb = hexToRgb(style.color);
      const bgRgb = hexToRgb(style.backgroundColor);
      if (!fgRgb || !bgRgb) return;
      // Skip transparent backgrounds
      if (style.backgroundColor === 'rgba(0, 0, 0, 0)' || style.backgroundColor === 'transparent') return;
      contrastChecked++;
      const ratio = contrastRatio(fgRgb, bgRgb);
      const fontSize = parseFloat(style.fontSize);
      const isBold = parseInt(style.fontWeight) >= 700;
      const isLarge = fontSize >= 18 || (isBold && fontSize >= 14);
      const minRatio = isLarge ? 3 : 4.5;
      if (ratio < minRatio) contrastIssues++;
    });
    results['1.4.3'] = {
      status: contrastIssues === 0 ? 'pass' : 'warn',
      checked: contrastChecked,
      issues: contrastIssues,
      detail: contrastIssues === 0
        ? `Geen contrastproblemen gevonden in ${contrastChecked} gecontroleerde elementen.`
        : `${contrastIssues} mogelijke contrastproblemen gevonden in ${contrastChecked} elementen (heuristisch).`
    };

    // 1.4.4 Tekstgrootte >= 12px
    let smallTextCount = 0;
    const allTextEls = Array.from(document.querySelectorAll('p, span, a, li, td, th, h1, h2, h3, h4, h5, h6, label, button, div')).slice(0, 200);
    allTextEls.forEach(el => {
      if (!el.innerText || !el.innerText.trim()) return;
      const style = getComputedStyle(el);
      const fontSize = parseFloat(style.fontSize);
      if (fontSize < 12) smallTextCount++;
    });
    results['1.4.4'] = {
      status: smallTextCount === 0 ? 'pass' : 'fail',
      issues: smallTextCount,
      detail: smallTextCount === 0
        ? 'Geen tekstelementen kleiner dan 12px gevonden.'
        : `${smallTextCount} elementen hebben tekst kleiner dan 12px.`
    };

    // 2.1.1 Toetsenbord – interactieve elementen zonder focusindicator
    const interactiveEls = Array.from(document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]'));
    let noFocusCount = 0;
    interactiveEls.slice(0, 50).forEach(el => {
      const style = getComputedStyle(el);
      if (style.outline === 'none' || style.outlineStyle === 'none' || style.outlineWidth === '0px') {
        // Check if there's a :focus class or alternative
        const hasAria = el.getAttribute('aria-describedby') || el.getAttribute('aria-label');
        noFocusCount++;
      }
    });
    results['2.1.1'] = {
      status: noFocusCount === 0 ? 'pass' : 'warn',
      total: interactiveEls.length,
      issues: noFocusCount,
      detail: noFocusCount === 0
        ? `Geen elementen gevonden met outline:none (${interactiveEls.length} interactieve elementen).`
        : `${noFocusCount} interactieve elementen hebben mogelijk geen zichtbare focusindicator.`
    };

    // 2.4.1 Blokken omzeilen – skip link of landmarks
    const hasSkipLink = !!document.querySelector('a[href^="#"]');
    const hasMain = !!document.querySelector('main, [role="main"]');
    const hasNav = !!document.querySelector('nav, [role="navigation"]');
    const hasHeader = !!document.querySelector('header, [role="banner"]');
    const landmarkCount = [hasMain, hasNav, hasHeader].filter(Boolean).length;
    results['2.4.1'] = {
      status: (hasSkipLink || landmarkCount >= 2) ? 'pass' : 'warn',
      hasSkipLink,
      hasMain,
      hasNav,
      hasHeader,
      detail: hasSkipLink
        ? 'Skiplink aanwezig.'
        : `Landmarks: ${[hasMain && 'main', hasNav && 'nav', hasHeader && 'header'].filter(Boolean).join(', ') || 'geen'}.`
    };

    // 2.4.2 Paginatitel
    const title = document.title.trim();
    results['2.4.2'] = {
      status: title ? 'pass' : 'fail',
      title,
      detail: title ? `Paginatitel: "${title}".` : 'Pagina heeft geen titel (<title> leeg of afwezig).'
    };

    // 2.4.6 Koppen en labels
    const headingCount = document.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
    results['2.4.6'] = {
      status: headingCount > 0 ? 'pass' : 'fail',
      count: headingCount,
      detail: headingCount > 0
        ? `${headingCount} kopelement(en) gevonden.`
        : 'Geen kopelementen (h1-h6) gevonden.'
    };

    // 3.1.1 Taal van pagina
    const lang = document.documentElement.getAttribute('lang');
    results['3.1.1'] = {
      status: lang && lang.trim() ? 'pass' : 'fail',
      lang,
      detail: lang ? `lang="${lang}" aanwezig op <html>.` : '<html> mist het lang-attribuut.'
    };

    // 3.3.2 Verplichte velden hebben labels
    const requiredInputs = Array.from(document.querySelectorAll('input[required], select[required], textarea[required]'));
    const requiredWithoutLabel = requiredInputs.filter(inp => !getInputLabel(inp));
    results['3.3.2'] = {
      status: requiredWithoutLabel.length === 0 ? 'pass' : 'fail',
      total: requiredInputs.length,
      missing: requiredWithoutLabel.length,
      detail: requiredInputs.length === 0
        ? 'Geen verplichte formuliervelden gevonden.'
        : requiredWithoutLabel.length === 0
          ? `Alle ${requiredInputs.length} verplichte velden hebben een label.`
          : `${requiredWithoutLabel.length} van ${requiredInputs.length} verplichte velden missen een label.`
    };

    // 4.1.2 Naam, rol, waarde
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    const emptyButtons = buttons.filter(btn => {
      const text = (btn.innerText || '').trim();
      const ariaLabel = btn.getAttribute('aria-label') || '';
      const ariaLabelledby = btn.getAttribute('aria-labelledby');
      const title = btn.getAttribute('title') || '';
      if (ariaLabelledby) {
        const el = document.getElementById(ariaLabelledby);
        if (el && el.innerText.trim()) return false;
      }
      return !text && !ariaLabel.trim() && !title.trim();
    });

    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const emptyLinks = anchors.filter(a => {
      const text = (a.innerText || '').trim();
      const ariaLabel = a.getAttribute('aria-label') || '';
      const title = a.getAttribute('title') || '';
      const hasImg = a.querySelector('img[alt]');
      return !text && !ariaLabel.trim() && !title.trim() && !hasImg;
    });

    const issues412 = emptyButtons.length + emptyLinks.length;
    results['4.1.2'] = {
      status: issues412 === 0 ? 'pass' : 'fail',
      emptyButtons: emptyButtons.length,
      emptyLinks: emptyLinks.length,
      detail: issues412 === 0
        ? `Alle ${buttons.length} knoppen en ${anchors.length} links hebben toegankelijke namen.`
        : `${emptyButtons.length} lege knop(pen) en ${emptyLinks.length} lege link(s) gevonden.`
    };

    return results;
  }

  // ── Return all data ────────────────────────────────────────────────────────
  return {
    headings: collectHeadings(),
    wcag: runWcagChecks(),
    links: collectLinks(),
    pageTitle: document.title,
    pageUrl: location.href
  };
})();
