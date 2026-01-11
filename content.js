// content.js - SERP badge injection
// Only runs when Preview Mode is ON

const DEFAULT_SETTINGS = {
  previewMode: false,
  disabledDomains: []
};

const TOP_N = 5;
const HOVER_DELAY_MS = 300;

const scannedAnchors = new WeakSet();
const renderedAnchors = new WeakSet();
const hoverTimers = new WeakMap();

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

    // Domain allow list (strong signals)
    const domainAllow = (
      host.includes("blog.naver.com") ||
      host.includes("post.naver.com") ||
      host.endsWith("tistory.com") ||
      host.endsWith("velog.io") ||
      host.endsWith("brunch.co.kr") ||
      host.endsWith("medium.com")
    );

    // Path signals (generic content URLs)
    const pathSignals = (
      path.includes("/post/") ||
      path.includes("/entry/") ||
      path.includes("/archives/") ||
      path.includes("/article/") ||
      path.includes("/blog/") ||
      path.includes("/p/") ||
      /\/\d+$/.test(path) // ends with number (e.g., /123)
    );

    // WordPress signal: ?p=123
    const wpSignal = q.has("p") && /^[0-9]+$/.test(q.get("p") || "");

    // Must have meaningful path
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
// Badge Creation
// ============================================================================

function createBadge(state, resultStatus) {
  const badge = document.createElement("span");
  badge.setAttribute("data-adcheck-badge", "1");

  // Reset styles
  badge.style.cssText = `
    all: unset;
    display: inline-flex;
    align-items: center;
    margin-left: 6px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    vertical-align: middle;
    white-space: nowrap;
  `;

  if (state === "analyzing") {
    badge.style.background = "#9CA3AF";
    badge.style.color = "white";
    badge.textContent = "⏳ 분석중";
    badge.title = "페이지를 분석하고 있습니다...";
  } else {
    if (resultStatus === "DETECTED") {
      badge.style.background = "#EF4444";
      badge.style.color = "white";
      badge.textContent = "🚨 광고";
      badge.title = "제휴/광고 링크가 발견되었습니다";
    } else if (resultStatus === "SUSPICIOUS") {
      badge.style.background = "#F59E0B";
      badge.style.color = "white";
      badge.textContent = "⚠️ 의심";
      badge.title = "단축 URL이 발견되었습니다 (광고일 수 있음)";
    } else {
      // CLEAN - don't show badge
      return null;
    }
  }

  return badge;
}

function ensureBadge(anchor) {
  const next = anchor.nextElementSibling;
  if (next && next.getAttribute("data-adcheck-badge") === "1") {
    return next;
  }
  const badge = createBadge("analyzing", null);
  if (badge) anchor.insertAdjacentElement("afterend", badge);
  return badge;
}

function updateBadge(anchor, resultStatus) {
  // Remove existing badge
  const existing = anchor.nextElementSibling;
  if (existing && existing.getAttribute("data-adcheck-badge") === "1") {
    existing.remove();
  }

  // Create new badge (or nothing if CLEAN)
  const badge = createBadge("done", resultStatus);
  if (badge) {
    anchor.insertAdjacentElement("afterend", badge);
  }
}

function removeAllBadges() {
  document.querySelectorAll('[data-adcheck-badge="1"]').forEach((el) => el.remove());
}

// ============================================================================
// Settings
// ============================================================================

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => resolve(items || DEFAULT_SETTINGS));
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

  // Also check for links in search result containers
  document.querySelectorAll('[data-ved] a[href], .g a[href], #rso a[href]').forEach((a) => {
    if (!a || !a.href) return;
    const h3 = a.querySelector('h3');
    if (h3) candidates.add(a);
  });

  // Naver
  document.querySelectorAll('a.total_tit, a.api_txt_lines, a.link_tit, .total_wrap a[href]').forEach((a) => {
    if (a && a.href) candidates.add(a);
  });

  // Daum
  document.querySelectorAll('#mArticle a[href], .wrap_cont a[href]').forEach((a) => {
    if (!a || !a.href) return;
    const text = (a.textContent || "").trim();
    if (text.length >= 5) candidates.add(a);
  });

  // Bing
  document.querySelectorAll('#b_results a[href]').forEach((a) => {
    if (!a || !a.href) return;
    const h2 = a.closest('h2');
    if (h2) candidates.add(a);
  });

  // Filter non-result links
  return Array.from(candidates).filter((a) => {
    const href = a.getAttribute("href") || "";
    if (href.startsWith("#")) return false;
    if (href.startsWith("javascript:")) return false;
    return true;
  });
}

function runScanner(settings) {
  const links = findSerpLinks();
  const valid = links.filter((a) => shouldScan(a.href));

  console.log(`[Content] Found ${valid.length} scannable links`);

  // Auto-scan top N
  valid.slice(0, TOP_N).forEach((a) => scheduleAnalyze(a));

  // On-demand for all
  valid.forEach((a) => attachHoverTriggers(a));
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const settings = await getSettings();

  // If Preview Mode is OFF, do nothing
  if (!settings.previewMode) {
    console.log("[Content] Preview Mode is OFF");
    return;
  }

  // If disabled on this site, do nothing
  if (isDisabledForThisSite(settings)) {
    console.log("[Content] Disabled on this site");
    return;
  }

  console.log("[Content] Starting scanner...");
  runScanner(settings);

  // Observe for dynamic content
  const mo = new MutationObserver(() => {
    runScanner(settings);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // React to settings changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    if (changes.previewMode && changes.previewMode.newValue === false) {
      removeAllBadges();
    }
  });
}

main().catch((e) => console.log("[Content] Error:", e));
