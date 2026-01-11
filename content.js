// content.js - SERP badge injection
// Only runs when Preview Mode is ON

const DEFAULT_SETTINGS = {
  previewMode: false,
  badgeStyle: 'text', // 'text' | 'icon'
  showClean: false,   // show "clean" badge for safe pages
  disabledDomains: []
};

const TOP_N = 5;
const HOVER_DELAY_MS = 300;

const scannedAnchors = new WeakSet();
const renderedAnchors = new WeakSet();
const hoverTimers = new WeakMap();

let currentSettings = { ...DEFAULT_SETTINGS };

// ============================================================================
// Utilities
// ============================================================================

function normalizeHost(host) {
  return (host || "").toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
}

function getHostname(url) {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

function isHttpUrl(url) {
  return /^https?:\/\//i.test(url);
}

function hasBadExtension(url) {
  return /\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|rar|7z|mp4|mov|avi|mp3|m4a|apk|exe)(\?|#|$)/i.test(url);
}

function hasPathSignal(url) {
  try {
    const u = new URL(url);
    const path = (u.pathname || "").toLowerCase();
    const q = u.searchParams;
    const host = normalizeHost(u.hostname);

    // Naver blog: must have logNo parameter (article) not just blogId
    if (host.includes("blog.naver.com")) {
      return q.has("logNo") || /\/\d+$/.test(path);
    }

    const domainAllow = (
      host.includes("post.naver.com") ||
      host.endsWith("tistory.com") ||
      host.endsWith("velog.io") ||
      host.endsWith("brunch.co.kr") ||
      host.endsWith("medium.com")
    );

    const pathSignals = (
      path.includes("/post/") ||
      path.includes("/entry/") ||
      path.includes("/archives/") ||
      path.includes("/article/") ||
      path.includes("/p/") ||
      /\/\d+$/.test(path)
    );

    const wpSignal = q.has("p") && /^[0-9]+$/.test(q.get("p") || "");
    const hasMeaningfulPath = path.length > 1;

    return (domainAllow || pathSignals || wpSignal) && hasMeaningfulPath;
  } catch {
    return false;
  }
}

function shouldScan(url) {
  if (!isHttpUrl(url)) return false;
  if (hasBadExtension(url)) return false;
  return hasPathSignal(url);
}

// ============================================================================
// SVG Icons
// ============================================================================

function getIconSvg(type) {
  const svgs = {
    analyzing: `
      <svg class="adcheck-spin" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>`,

    detected: `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>`,

    suspicious: `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>`,

    clean: `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6 9 17l-5-5"/>
      </svg>`
  };
  return svgs[type] || "";
}

function injectStyles() {
  if (document.getElementById("adcheck-style")) return;

  const style = document.createElement("style");
  style.id = "adcheck-style";
  style.textContent = `
    @keyframes adcheck-spin { 
      from { transform: rotate(0deg); } 
      to { transform: rotate(360deg); } 
    }
    .adcheck-spin { animation: adcheck-spin 1s linear infinite; }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// Badge Creation
// ============================================================================

function createBadge(state, resultStatus) {
  const badge = document.createElement("span");
  badge.setAttribute("data-adcheck-badge", "1");

  const isGoogle = window.location.hostname.includes("google");
  const useIcon = currentSettings.badgeStyle === 'icon';

  if (useIcon) {
    // Icon style
    badge.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 6px;
      width: 16px;
      height: 16px;
      vertical-align: middle;
      cursor: help;
      ${isGoogle ? 'transform: scaleY(-1);' : ''}
    `;

    injectStyles();

    if (state === "analyzing") {
      badge.innerHTML = getIconSvg("analyzing");
      badge.style.color = "#9CA3AF";
      badge.title = "분석 중...";
    } else if (resultStatus === "DETECTED") {
      badge.innerHTML = getIconSvg("detected");
      badge.style.color = "#DC2626";
      badge.title = "광고/수익 링크가 발견되었습니다";
    } else if (resultStatus === "SUSPICIOUS") {
      badge.innerHTML = getIconSvg("suspicious");
      badge.style.color = "#D97706";
      badge.title = "단축 URL 또는 우회 경로가 의심됩니다";
    } else if (resultStatus === "CLEAN" && currentSettings.showClean) {
      badge.innerHTML = getIconSvg("clean");
      badge.style.color = "#16A34A";
      badge.title = "광고 링크가 발견되지 않았습니다";
    } else {
      return null;
    }
  } else {
    // Text style (default)
    badge.style.cssText = `
      display: inline-flex !important;
      align-items: center !important;
      margin-left: 4px !important;
      padding: 1px 5px !important;
      border-radius: 3px !important;
      font-size: 10px !important;
      font-weight: 500 !important;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
      vertical-align: middle !important;
      white-space: nowrap !important;
      width: auto !important;
      max-width: 50px !important;
      height: auto !important;
      position: relative !important;
      float: none !important;
      ${isGoogle ? 'transform: scaleY(-1) !important;' : ''}
    `;

    if (state === "analyzing") {
      badge.style.background = "#9CA3AF";
      badge.style.color = "white";
      badge.textContent = "...";
      badge.title = "분석 중";
    } else if (resultStatus === "DETECTED") {
      badge.style.background = "#EF4444";
      badge.style.color = "white";
      badge.textContent = "광고";
      badge.title = "쿠팡 파트너스 발견";
    } else if (resultStatus === "SUSPICIOUS") {
      badge.style.background = "#F59E0B";
      badge.style.color = "white";
      badge.textContent = "의심";
      badge.title = "단축 URL 발견";
    } else if (resultStatus === "CLEAN" && currentSettings.showClean) {
      badge.style.background = "#16A34A";
      badge.style.color = "white";
      badge.textContent = "✓";
      badge.title = "광고 없음";
    } else {
      return null;
    }
  }

  return badge;
}

// ============================================================================
// Badge Insertion - Fixed positioning
// ============================================================================

function findInsertPoint(anchor) {
  // For Google: find the h3 title and insert after it
  const h3 = anchor.querySelector('h3');
  if (h3) return { element: h3, position: 'afterend' };

  // For Naver: insert after the anchor's text
  return { element: anchor, position: 'beforeend' };
}

function ensureBadge(anchor) {
  // Check if badge already exists
  const existing = anchor.querySelector('[data-adcheck-badge]') ||
    anchor.parentElement?.querySelector('[data-adcheck-badge]');
  if (existing) return existing;

  const badge = createBadge("analyzing", null);
  if (!badge) return null;

  const { element, position } = findInsertPoint(anchor);
  element.insertAdjacentElement(position, badge);
  return badge;
}

function updateBadge(anchor, resultStatus) {
  // Remove existing badges
  const existingInAnchor = anchor.querySelector('[data-adcheck-badge]');
  const existingAfter = anchor.nextElementSibling;

  if (existingInAnchor) existingInAnchor.remove();
  if (existingAfter && existingAfter.getAttribute('data-adcheck-badge') === '1') {
    existingAfter.remove();
  }

  // Also check inside h3
  const h3 = anchor.querySelector('h3');
  if (h3) {
    const badgeInH3 = h3.querySelector('[data-adcheck-badge]');
    if (badgeInH3) badgeInH3.remove();
    const badgeAfterH3 = h3.nextElementSibling;
    if (badgeAfterH3 && badgeAfterH3.getAttribute('data-adcheck-badge') === '1') {
      badgeAfterH3.remove();
    }
  }

  // Create new badge
  const badge = createBadge("done", resultStatus);
  if (!badge) return;

  const { element, position } = findInsertPoint(anchor);
  element.insertAdjacentElement(position, badge);
}

function removeAllBadges() {
  document.querySelectorAll('[data-adcheck-badge="1"]').forEach((el) => el.remove());
}

// ============================================================================
// Settings
// ============================================================================

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      currentSettings = items || DEFAULT_SETTINGS;
      resolve(currentSettings);
    });
  });
}

function isDisabledForThisSite(settings) {
  const host = normalizeHost(window.location.hostname);
  const disabled = (settings.disabledDomains || []).map(normalizeHost);
  return disabled.includes(host);
}

// ============================================================================
// Analysis
// ============================================================================

async function analyzeAndRender(anchor, url) {
  if (renderedAnchors.has(anchor)) return;

  ensureBadge(anchor);

  try {
    const resp = await chrome.runtime.sendMessage({ type: "ANALYZE_URL", url });

    if (!resp || !resp.ok) {
      updateBadge(anchor, "CLEAN");
      renderedAnchors.add(anchor);
      return;
    }

    const status = resp.result?.status || "CLEAN";
    updateBadge(anchor, status);
    renderedAnchors.add(anchor);
  } catch (e) {
    console.log("[Content] Analysis error:", e);
    updateBadge(anchor, "CLEAN");
    renderedAnchors.add(anchor);
  }
}

function scheduleAnalyze(anchor) {
  if (!anchor || scannedAnchors.has(anchor)) return;

  const url = anchor.href;
  if (!url || !shouldScan(url)) return;

  scannedAnchors.add(anchor);
  analyzeAndRender(anchor, url).catch(() => { });
}

function attachHoverTriggers(anchor) {
  anchor.addEventListener("mouseover", () => {
    if (scannedAnchors.has(anchor)) return;
    const t = setTimeout(() => scheduleAnalyze(anchor), HOVER_DELAY_MS);
    hoverTimers.set(anchor, t);
  });

  anchor.addEventListener("mouseout", () => {
    const t = hoverTimers.get(anchor);
    if (t) clearTimeout(t);
  });

  anchor.addEventListener("mousedown", () => {
    scheduleAnalyze(anchor);
  }, { capture: true });
}

// ============================================================================
// SERP Link Detection
// ============================================================================

function findSerpLinks() {
  const candidates = new Set();

  // Google: links containing h3
  document.querySelectorAll('a h3').forEach((h3) => {
    const a = h3.closest("a");
    if (a && a.href) candidates.add(a);
  });

  // Google: links in search result containers
  document.querySelectorAll('[data-ved] a[href], .g a[href], #rso a[href]').forEach((a) => {
    if (!a || !a.href) return;
    const h3 = a.querySelector('h3');
    if (h3) candidates.add(a);
  });

  // Naver - only blog article links, not navigation
  document.querySelectorAll('a[href*="blog.naver.com"]').forEach((a) => {
    if (!a || !a.href) return;
    const text = (a.innerText || "").trim();
    // Skip short text (navigation) and "더보기" type links
    if (text.length < 10) return;
    if (text.includes("더보기") || text.includes("전체보기")) return;
    // Must be article URL (with logNo or /number)
    const href = a.href;
    if (href.includes("logNo=") || /\/\d{9,}/.test(href)) {
      candidates.add(a);
    }
  });

  // Tistory links
  document.querySelectorAll('a[href*="tistory.com"]').forEach((a) => {
    if (!a || !a.href) return;
    const text = (a.innerText || "").trim();
    if (text.length < 10) return;
    if (/\/\d+$/.test(a.href)) candidates.add(a);
  });

  // Daum
  document.querySelectorAll('#mArticle a[href], .wrap_cont a[href]').forEach((a) => {
    if (!a || !a.href) return;
    const text = (a.textContent || "").trim();
    if (text.length >= 10) candidates.add(a);
  });

  // Bing
  document.querySelectorAll('#b_results a[href]').forEach((a) => {
    if (!a || !a.href) return;
    const h2 = a.closest('h2');
    if (h2) candidates.add(a);
  });

  return Array.from(candidates).filter((a) => {
    const href = a.getAttribute("href") || "";
    const text = (a.innerText || "").trim();
    if (href.startsWith("#")) return false;
    if (href.startsWith("javascript:")) return false;
    // Skip navigation/utility links
    if (text.includes("더보기") || text.includes("전체") || text.includes("펼쳐보기")) return false;
    return true;
  });
}

function runScanner(settings) {
  const links = findSerpLinks();
  const valid = links.filter((a) => shouldScan(a.href));

  console.log(`[Content] Found ${valid.length} scannable links`);

  valid.slice(0, TOP_N).forEach((a) => scheduleAnalyze(a));
  valid.forEach((a) => attachHoverTriggers(a));
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const settings = await getSettings();

  if (!settings.previewMode) {
    console.log("[Content] Preview Mode is OFF");
    return;
  }

  if (isDisabledForThisSite(settings)) {
    console.log("[Content] Disabled on this site");
    return;
  }

  console.log("[Content] Starting scanner...");
  runScanner(settings);

  const mo = new MutationObserver(() => {
    runScanner(settings);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    if (changes.previewMode && changes.previewMode.newValue === false) {
      removeAllBadges();
    }

    // Reload settings for style changes
    if (changes.badgeStyle) {
      currentSettings.badgeStyle = changes.badgeStyle.newValue;
      // Re-render would require page refresh for now
    }
  });
}

main().catch((e) => console.log("[Content] Error:", e));
