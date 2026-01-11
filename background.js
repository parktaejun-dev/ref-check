/**
 * Background Service Worker
 * Fetches and analyzes pages for Coupang affiliate links
 */

const COUPANG_PATTERNS = [
  'coupang.com',
  'link.coupang.com',
  'coupa.ng',
  'partners.coupang.com'
];

const DISCLOSURE_PATTERNS = [
  /쿠팡\s?파트너스/gi,
  /파트너스\s?활동/gi,
  /일정액의\s?수수료/gi,
  /수수료를\s?제공받/gi,
  /제휴\s?활동/gi,
  /이\s?포스팅은.*대가/gi,
  /소정의\s?수수료/gi
];

/**
 * Analyze HTML content for Coupang links
 */
function analyzeHtml(html) {
  const results = {
    hasCoupangLinks: false,
    coupangLinkCount: 0,
    hasDisclosure: false,
    disclosureText: null
  };

  // Find all unique Coupang URLs (direct links)
  const uniqueUrls = new Set();

  // Match href="...coupang..." or href='...coupang...'
  const hrefPattern = /href\s*=\s*["']([^"']*(?:coupang\.com|coupa\.ng)[^"']*)["']/gi;
  let match;
  while ((match = hrefPattern.exec(html)) !== null) {
    uniqueUrls.add(match[1]);
  }

  // Also check for common URL shorteners used to hide affiliate links
  const shortenerPatterns = [
    /href\s*=\s*["']([^"']*sele\.kr[^"']*)["']/gi,
    /href\s*=\s*["']([^"']*bit\.ly[^"']*)["']/gi,
    /href\s*=\s*["']([^"']*han\.gl[^"']*)["']/gi,
    /href\s*=\s*["']([^"']*me2\.do[^"']*)["']/gi,
    /href\s*=\s*["']([^"']*vo\.la[^"']*)["']/gi,
    /href\s*=\s*["']([^"']*url\.kr[^"']*)["']/gi,
    /href\s*=\s*["']([^"']*zrr\.kr[^"']*)["']/gi,
    /href\s*=\s*["']([^"']*ouo\.io[^"']*)["']/gi
  ];

  let shortenerCount = 0;
  for (const pattern of shortenerPatterns) {
    let m;
    while ((m = pattern.exec(html)) !== null) {
      shortenerCount++;
    }
  }

  results.coupangLinkCount = uniqueUrls.size;
  results.hasCoupangLinks = uniqueUrls.size > 0;

  // Check for disclosure text (쿠팡 파트너스 고지 문구)
  for (const pattern of DISCLOSURE_PATTERNS) {
    const disclosureMatch = html.match(pattern);
    if (disclosureMatch) {
      results.hasDisclosure = true;
      results.disclosureText = disclosureMatch[0];
      break;
    }
  }

  // If disclosure text exists but no direct Coupang links found, 
  // they're likely using URL shorteners - still flag as affiliate
  if (results.hasDisclosure && !results.hasCoupangLinks && shortenerCount > 0) {
    results.hasCoupangLinks = true;
    results.coupangLinkCount = shortenerCount;
    results.isHidden = true; // Flag that links are hidden behind shorteners
  }

  return results;
}

/**
 * Handle page analysis request
 */
async function analyzePage(url) {
  console.log('[Background] Analyzing:', url);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      },
      credentials: 'omit'
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log('[Background] HTTP error:', response.status);
      return { error: `HTTP ${response.status}`, hasCoupangLinks: false };
    }

    const html = await response.text();
    console.log('[Background] Got HTML, length:', html.length);

    const analysis = analyzeHtml(html);
    console.log('[Background] Analysis result:', analysis);

    return {
      success: true,
      url: url,
      ...analysis
    };
  } catch (error) {
    console.log('[Background] Error:', error.message);
    if (error.name === 'AbortError') {
      return { error: 'timeout', hasCoupangLinks: false };
    }
    return { error: error.message, hasCoupangLinks: false };
  }
}

/**
 * Message listener
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] Received message:', request.action);

  if (request.action === 'analyzePage') {
    analyzePage(request.url)
      .then(result => {
        console.log('[Background] Sending response:', result);
        sendResponse(result);
      })
      .catch(err => {
        console.log('[Background] Error in analyzePage:', err);
        sendResponse({ error: err.message, hasCoupangLinks: false });
      });
    return true; // Keep channel open for async response
  }

  // Ping for testing
  if (request.action === 'ping') {
    sendResponse({ pong: true });
    return true;
  }
});

console.log('[Background] Service worker initialized');
