/**
 * Coupang Partners Link Detector
 * Shows warning badges on ALL blog links in search results
 * With user-configurable settings
 */

(function () {
  'use strict';

  // ============================================================================
  // Configuration
  // ============================================================================

  const CONFIG = {
    // Sites to ALWAYS analyze (even if parent domain is in SKIP)
    ANALYZE_DOMAINS: [
      'blog.naver.com', 'post.naver.com', 'blog.daum.net', 'brunch.co.kr',
      'tistory.com', 'velog.io', 'medium.com'
    ],
    // Sites to SKIP (don't analyze) - news, portals, official sites
    SKIP_DOMAINS: [
      // 포털/검색 (메인만)
      'www.google.com', 'www.google.co.kr', 'www.naver.com', 'www.daum.net', 'www.bing.com',
      'search.naver.com', 'search.daum.net',
      // 뉴스
      'news.naver.com', 'news.daum.net',
      'chosun.com', 'donga.com', 'joongang.co.kr', 'hani.co.kr', 'khan.co.kr',
      'mk.co.kr', 'hankyung.com', 'sbs.co.kr', 'kbs.co.kr', 'mbc.co.kr',
      'yna.co.kr', 'ytn.co.kr', 'newsis.com', 'news1.kr', 'edaily.co.kr',
      'zdnet.co.kr', 'bloter.net', 'etnews.com', 'dt.co.kr',
      // 공식 사이트
      'apple.com', 'samsung.com', 'lg.com', 'coupang.com', 'kakao.com',
      'microsoft.com', 'amazon.com', 'github.com', 'stackoverflow.com',
      // 동영상/SNS
      'youtube.com', 'youtu.be', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
      // 쇼핑몰 (공식)
      '11st.co.kr', 'gmarket.co.kr', 'auction.co.kr', 'ssg.com', 'lotteon.com',
      // 기타 신뢰 사이트
      'wikipedia.org', 'namu.wiki', 'namuwiki.kr', 'kin.naver.com', 'cafe.naver.com'
    ],
    SEARCH_ENGINES: ['google.com', 'google.co.kr', 'search.naver.com', 'search.daum.net', 'bing.com'],
    MAX_CONCURRENT: 5,
    CACHE_DURATION: 30 * 60 * 1000,
    REQUEST_TIMEOUT: 10000
  };

  const DEFAULT_SETTINGS = {
    theme: 'rocket',
    badgeSize: 'M',
    badgePosition: 'after',
    showYellow: true,
    disabledDomains: []
  };

  // Theme definitions
  const THEMES = {
    rocket: { red: '🚀 쿠팡', yellow: '👀 광고?' },
    dog: { red: '🐶 멍!', yellow: '🐾 킁킁' },
    simple: { red: '⚡ 쿠팡', yellow: '❕ 주의' },
    text: { red: '쿠팡 파트너스', yellow: '대가성 문구' }
  };

  const SIZE_MAP = {
    S: '11px',
    M: '12px',
    L: '13px'
  };

  // ============================================================================
  // Config Manager
  // ============================================================================

  class ConfigManager {
    constructor() {
      this.settings = { ...DEFAULT_SETTINGS };
      this.listeners = [];
    }

    async load() {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
            this.settings = result;
            resolve(this.settings);
          });
        } else {
          resolve(this.settings);
        }
      });
    }

    get(key) {
      return this.settings[key];
    }

    getTheme() {
      return THEMES[this.settings.theme] || THEMES.rocket;
    }

    getFontSize() {
      return SIZE_MAP[this.settings.badgeSize] || SIZE_MAP.M;
    }

    isDisabledDomain(hostname) {
      return (this.settings.disabledDomains || []).includes(hostname);
    }

    onChange(callback) {
      this.listeners.push(callback);
    }

    notifyChange() {
      this.listeners.forEach((cb) => cb(this.settings));
    }

    startListening() {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'sync') {
            Object.keys(changes).forEach((key) => {
              this.settings[key] = changes[key].newValue;
            });
            this.notifyChange();
          }
        });
      }
    }
  }

  const configManager = new ConfigManager();

  // ============================================================================
  // Styles
  // ============================================================================

  function injectStyles() {
    // Remove existing styles if any
    const existing = document.getElementById('cpd-styles');
    if (existing) existing.remove();

    const isGoogle = window.location.hostname.includes('google');
    const fontSize = configManager.getFontSize();

    const style = document.createElement('style');
    style.id = 'cpd-styles';
    style.textContent = `
      .cpd-badge {
        display: inline-flex !important;
        align-items: center !important;
        gap: 3px !important;
        margin-left: 6px !important;
        margin-right: 6px !important;
        padding: 2px 8px !important;
        border-radius: 4px !important;
        font-size: ${fontSize} !important;
        font-weight: 700 !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        line-height: 1.4 !important;
        white-space: nowrap !important;
        text-decoration: none !important;
        vertical-align: middle !important;
        ${isGoogle ? 'transform: scaleY(-1) !important;' : 'transform: none !important;'}
      }

      .cpd-badge-danger {
        background: #dc2626 !important;
        color: white !important;
      }

      .cpd-badge-safe {
        background: #16a34a !important;
        color: white !important;
      }

      .cpd-badge-warning {
        background: #f59e0b !important;
        color: white !important;
      }

      .cpd-badge-loading {
        background: #6b7280 !important;
        color: white !important;
      }

      .cpd-badge-error {
        background: #f59e0b !important;
        color: white !important;
      }

      .cpd-spinner {
        display: inline-block !important;
        width: 10px !important;
        height: 10px !important;
        border: 2px solid rgba(255,255,255,0.3) !important;
        border-top-color: white !important;
        border-radius: 50% !important;
        animation: cpd-spin 0.6s linear infinite !important;
      }

      @keyframes cpd-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  function extractUrl(href) {
    if (!href) return null;
    if (href.includes('/url?')) {
      try {
        const url = new URL(href, window.location.origin);
        return url.searchParams.get('url') || url.searchParams.get('q') || href;
      } catch {
        return href;
      }
    }
    return href;
  }

  function shouldAnalyzeUrl(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      // Skip if it's the current site
      if (hostname === window.location.hostname) return false;

      // ALWAYS analyze if in ANALYZE_DOMAINS (whitelist - blog subdomains)
      if (CONFIG.ANALYZE_DOMAINS.some((d) => hostname.includes(d))) return true;

      // Skip if in SKIP_DOMAINS list (blacklist - news, portals, etc.)
      if (CONFIG.SKIP_DOMAINS.some((d) => hostname.includes(d))) return false;

      // Analyze everything else (WordPress, custom domains, etc.)
      return true;
    } catch {
      return false;
    }
  }

  function isSearchPage() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const search = window.location.search;

    // Google: must be on /search with q parameter
    if (hostname.includes('google')) {
      return pathname.includes('/search') && search.includes('q=');
    }

    // Naver: must be on search.naver.com
    if (hostname.includes('naver')) {
      return hostname.startsWith('search.');
    }

    // Daum: must be on search.daum.net
    if (hostname.includes('daum')) {
      return hostname.startsWith('search.');
    }

    // Bing: must be on /search with q parameter
    if (hostname.includes('bing')) {
      return pathname.includes('/search') && search.includes('q=');
    }

    return false;
  }

  // ============================================================================
  // Cache & State
  // ============================================================================

  const cache = new Map();
  let processedLinks = new WeakSet();
  let processedUrls = new Set();

  function getCached(url) {
    const c = cache.get(url);
    return c && Date.now() - c.ts < CONFIG.CACHE_DURATION ? c.result : null;
  }

  function setCache(url, result) {
    cache.set(url, { result, ts: Date.now() });
  }

  function resetProcessed() {
    processedLinks = new WeakSet();
    processedUrls = new Set();
  }

  // ============================================================================
  // Badge Functions
  // ============================================================================

  function createBadge(type, text, tooltip) {
    const badge = document.createElement('span');
    badge.className = `cpd-badge cpd-badge-${type}`;
    badge.textContent = text;
    if (tooltip) badge.title = tooltip;
    return badge;
  }

  function createLoadingBadge() {
    const badge = document.createElement('span');
    badge.className = 'cpd-badge cpd-badge-loading';
    badge.innerHTML = '<span class="cpd-spinner"></span> 분석중';
    return badge;
  }

  function insertBadge(titleLink, badge) {
    // Remove existing badge
    const parent = titleLink.parentElement;
    if (parent) {
      const existing = parent.querySelector('.cpd-badge');
      if (existing) existing.remove();
    }

    // Insert based on position setting
    const position = configManager.get('badgePosition');
    if (position === 'before') {
      titleLink.insertAdjacentElement('beforebegin', badge);
    } else {
      titleLink.insertAdjacentElement('afterend', badge);
    }
  }

  function removeAllBadges() {
    document.querySelectorAll('.cpd-badge').forEach((b) => b.remove());
  }

  function showResult(titleLink, result) {
    const theme = configManager.getTheme();
    const showYellow = configManager.get('showYellow');
    let badge;

    if (result.hasCoupangLinks) {
      const n = result.coupangLinkCount || 1;
      const isHidden = result.isHidden;
      const baseText = theme.red;
      const text = isHidden ? `${baseText} (숨김${n})` : `${baseText} ${n}개`;
      const tooltip = result.hasDisclosure
        ? `${isHidden ? '단축URL로 숨겨진 ' : ''}쿠팡 파트너스 링크 ${n}개 발견\n"${result.disclosureText}"`
        : `쿠팡 파트너스 링크 ${n}개 발견`;
      badge = createBadge('danger', text, tooltip);
    } else if (result.hasDisclosure) {
      // Has disclosure text but no links found - show as warning if enabled
      if (!showYellow) return; // Don't show yellow badge if disabled
      badge = createBadge('warning', theme.yellow, `"${result.disclosureText}" 문구 발견`);
    } else {
      // No Coupang links found - don't show any badge
      return;
    }

    insertBadge(titleLink, badge);
  }

  function showError(titleLink, msg) {
    insertBadge(titleLink, createBadge('error', '⚠️ 오류', msg));
  }

  // ============================================================================
  // Analyzer
  // ============================================================================

  let pending = 0;
  const queue = [];

  function analyze(titleLink, url) {
    // Check cache
    const cached = getCached(url);
    if (cached) {
      showResult(titleLink, cached);
      return Promise.resolve();
    }

    // Show loading
    insertBadge(titleLink, createLoadingBadge());

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        showError(titleLink, '시간초과');
        resolve();
      }, CONFIG.REQUEST_TIMEOUT);

      chrome.runtime.sendMessage({ action: 'analyzePage', url }, (response) => {
        clearTimeout(timeout);

        if (chrome.runtime.lastError || !response || response.error) {
          showError(titleLink, chrome.runtime.lastError?.message || response?.error || '분석실패');
        } else {
          setCache(url, response);
          showResult(titleLink, response);
        }
        resolve();
      });
    });
  }

  function processQueue() {
    while (queue.length > 0 && pending < CONFIG.MAX_CONCURRENT) {
      const { titleLink, url } = queue.shift();
      pending++;
      analyze(titleLink, url).finally(() => {
        pending--;
        processQueue();
      });
    }
  }

  function queueAnalysis(titleLink, url) {
    queue.push({ titleLink, url });
    processQueue();
  }

  // ============================================================================
  // Scanner
  // ============================================================================

  function findBlogTitleLinks() {
    const results = [];

    document.querySelectorAll('a[href]').forEach((link) => {
      if (processedLinks.has(link)) return;

      let href = extractUrl(link.getAttribute('href'));
      if (!href || !shouldAnalyzeUrl(href)) return;

      let fullUrl;
      try {
        fullUrl = new URL(href, window.location.href).href;
      } catch {
        return;
      }

      // Skip if we already processed this URL
      if (processedUrls.has(fullUrl)) {
        processedLinks.add(link);
        return;
      }

      // Must be inside a search result container (not header, footer, nav)
      const isInSearchResult = link.closest('[data-hveid]') ||
        link.closest('[data-ved]') ||
        link.closest('.g') ||
        link.closest('#search') ||
        link.closest('#rso') ||
        link.closest('.search_result') ||
        link.closest('.total_wrap'); // Naver

      if (!isInSearchResult) return;

      // Check if this is a main title link
      const hasText = link.textContent.trim().length > 5;
      const inH3 = link.closest('h3');
      const isMainLink = hasText || inH3;

      if (!isMainLink) return;

      const rect = link.getBoundingClientRect();
      if (rect.width < 50) return;


      processedLinks.add(link);
      processedUrls.add(fullUrl);
      results.push({ titleLink: link, url: fullUrl });
    });

    return results;
  }

  function scan() {
    if (!isSearchPage()) {
      console.log('[CPD] Not a search engine page');
      return;
    }

    // Check if current domain is disabled
    if (configManager.isDisabledDomain(window.location.hostname)) {
      console.log('[CPD] Domain is disabled');
      removeAllBadges();
      return;
    }

    console.log('[CPD] Scanning for blog links...');

    const blogLinks = findBlogTitleLinks();
    console.log(`[CPD] Found ${blogLinks.length} blog links`);

    blogLinks.forEach(({ titleLink, url }) => {
      queueAnalysis(titleLink, url);
    });
  }

  // ============================================================================
  // Re-render on settings change
  // ============================================================================

  function handleSettingsChange() {
    console.log('[CPD] Settings changed, re-rendering...');

    // Re-inject styles with new sizes
    injectStyles();

    // Remove all existing badges
    removeAllBadges();

    // Reset processed state
    resetProcessed();

    // Re-scan
    scan();
  }

  // ============================================================================
  // Initialize
  // ============================================================================

  async function init() {
    console.log('[CPD] Coupang Partner Detector starting...');

    // Load settings
    await configManager.load();

    // Check if disabled on this domain
    if (configManager.isDisabledDomain(window.location.hostname)) {
      console.log('[CPD] Disabled on this domain');
      return;
    }

    // Inject styles
    injectStyles();

    // Listen for settings changes
    configManager.onChange(handleSettingsChange);
    configManager.startListening();

    // Initial scan with delay
    setTimeout(scan, 500);

    // Watch for dynamic content
    let scanTimeout;
    const observer = new MutationObserver(() => {
      clearTimeout(scanTimeout);
      scanTimeout = setTimeout(scan, 800);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
