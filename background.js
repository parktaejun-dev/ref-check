// background.js - MV3 Service Worker
// Rate limiter + URL-based affiliate detection

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const HOST_MIN_DELAY_MS = 1000; // 1s between fetches per host
const FETCH_TIMEOUT_MS = 5000;

const cache = new Map(); // url -> { status, timestamp }
const hostLastFetch = new Map(); // host -> lastFetchTimestamp

function now() {
  return Date.now();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCacheValid(entry) {
  return entry && (now() - entry.timestamp) < CACHE_TTL_MS;
}

function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hash = "";

    // Remove tracking params
    const removeKeys = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "gclid", "fbclid", "igshid", "mc_cid", "mc_eid",
      "spm", "sc_channel", "ref", "referrer", "source"
    ];
    removeKeys.forEach((k) => u.searchParams.delete(k));

    // Normalize www
    u.hostname = u.hostname.replace(/^www\./i, "");

    // Remove trailing slash
    if (u.pathname.length > 1) {
      u.pathname = u.pathname.replace(/\/+$/g, "");
    }

    return u.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Scan HTML for affiliate links
 * Returns: "DETECTED" | "SUSPICIOUS" | "CLEAN"
 */
function scanHtmlForAffiliate(htmlText) {
  const html = htmlText.toLowerCase();

  // 1. Definite affiliate domains (RED badge)
  const definiteDomains = [
    "coupa.ng",
    "link.coupang.com",
    "coupang.com/vp/products",
    "partners.coupang.com",
    "linkprice.com",
    "linkprice.kr",
    "adpick.co.kr",
    "tenping.kr",
    "clickmon.co.kr",
    "dable.io",
    "criteo.com"
  ];

  for (const d of definiteDomains) {
    if (html.includes(d)) return "DETECTED";
  }

  // Coupang href regex
  const coupangHref = /href\s*=\s*["']\s*https?:\/\/(?:www\.)?(?:coupa\.ng|link\.coupang\.com)[^"']*/i;
  if (coupangHref.test(htmlText)) return "DETECTED";

  // 2. Suspicious shortener domains (ORANGE badge)
  const suspiciousDomains = [
    "bit.ly", "vo.la", "c11.kr", "abit.ly", "me2.do",
    "han.gl", "url.kr", "zrr.kr", "ouo.io", "sele.kr"
  ];

  for (const d of suspiciousDomains) {
    const regex = new RegExp(`href\\s*=\\s*["']\\s*https?:\\/\\/(?:www\\.)?${d.replace(/\./g, '\\.')}`, 'i');
    if (regex.test(htmlText)) return "SUSPICIOUS";
  }

  return "CLEAN";
}

async function enforceHostRateLimit(hostname) {
  const host = (hostname || "").replace(/^www\./i, "");
  const last = hostLastFetch.get(host) || 0;
  const elapsed = now() - last;

  if (elapsed < HOST_MIN_DELAY_MS) {
    await sleep(HOST_MIN_DELAY_MS - elapsed);
  }
  hostLastFetch.set(host, now());
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal
    });

    const text = await res.text();
    return text;
  } finally {
    clearTimeout(t);
  }
}

async function analyzeUrl(rawUrl) {
  const url = normalizeUrl(rawUrl);

  // Check cache
  const cached = cache.get(url);
  if (isCacheValid(cached)) return cached;

  // Get host for rate limiting
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    const fail = { status: "CLEAN", timestamp: now() };
    cache.set(url, fail);
    return fail;
  }

  await enforceHostRateLimit(host);

  try {
    const html = await fetchWithTimeout(url);
    const status = scanHtmlForAffiliate(html);

    const result = { status, timestamp: now() };
    cache.set(url, result);
    return result;
  } catch (e) {
    console.log("[Background] Fetch error:", e.message);
    const result = { status: "CLEAN", timestamp: now() };
    cache.set(url, result);
    return result;
  }
}

// Message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "ANALYZE_URL" && typeof msg.url === "string") {
    analyzeUrl(msg.url)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async response
  }

  if (msg.type === "PING") {
    sendResponse({ ok: true, ts: now() });
  }
});

console.log("[Background] Service worker initialized");
