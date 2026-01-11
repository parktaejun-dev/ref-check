/**
 * Popup Settings Script
 * Manages user preferences for Coupang Detector
 */

const DEFAULT_SETTINGS = {
    theme: 'rocket',
    badgeSize: 'M',
    badgePosition: 'after',
    showYellow: true,
    disabledDomains: []
};

let currentHostname = '';

// ============================================================================
// Storage Helpers
// ============================================================================

async function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
            resolve(result);
        });
    });
}

async function saveSetting(key, value) {
    return new Promise((resolve) => {
        chrome.storage.sync.set({ [key]: value }, resolve);
    });
}

async function saveSettings(settings) {
    return new Promise((resolve) => {
        chrome.storage.sync.set(settings, resolve);
    });
}

// ============================================================================
// UI Update
// ============================================================================

function updateUI(settings) {
    // Theme
    const themeRadio = document.querySelector(`input[name="theme"][value="${settings.theme}"]`);
    if (themeRadio) themeRadio.checked = true;

    // Badge Size
    const sizeRadio = document.querySelector(`input[name="badgeSize"][value="${settings.badgeSize}"]`);
    if (sizeRadio) sizeRadio.checked = true;

    // Badge Position
    const positionRadio = document.querySelector(`input[name="badgePosition"][value="${settings.badgePosition}"]`);
    if (positionRadio) positionRadio.checked = true;

    // Show Yellow
    document.getElementById('showYellow').checked = settings.showYellow;

    // Current Site Toggle
    const siteEnabled = !settings.disabledDomains.includes(currentHostname);
    document.getElementById('siteEnabled').checked = siteEnabled;
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupListeners() {
    // Theme change
    document.querySelectorAll('input[name="theme"]').forEach((radio) => {
        radio.addEventListener('change', (e) => {
            saveSetting('theme', e.target.value);
        });
    });

    // Size change
    document.querySelectorAll('input[name="badgeSize"]').forEach((radio) => {
        radio.addEventListener('change', (e) => {
            saveSetting('badgeSize', e.target.value);
        });
    });

    // Position change
    document.querySelectorAll('input[name="badgePosition"]').forEach((radio) => {
        radio.addEventListener('change', (e) => {
            saveSetting('badgePosition', e.target.value);
        });
    });

    // Show Yellow toggle
    document.getElementById('showYellow').addEventListener('change', (e) => {
        saveSetting('showYellow', e.target.checked);
    });

    // Site enable/disable toggle
    document.getElementById('siteEnabled').addEventListener('change', async (e) => {
        const settings = await loadSettings();
        let disabledDomains = settings.disabledDomains || [];

        if (e.target.checked) {
            // Enable: remove from disabled list
            disabledDomains = disabledDomains.filter((d) => d !== currentHostname);
        } else {
            // Disable: add to disabled list
            if (!disabledDomains.includes(currentHostname)) {
                disabledDomains.push(currentHostname);
            }
        }

        saveSetting('disabledDomains', disabledDomains);
    });

    // Reset button
    document.getElementById('resetBtn').addEventListener('click', async () => {
        if (confirm('모든 설정을 초기화하시겠습니까?')) {
            await saveSettings(DEFAULT_SETTINGS);
            updateUI(DEFAULT_SETTINGS);
        }
    });
}

// ============================================================================
// Get Current Tab
// ============================================================================

async function getCurrentTabHostname() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url) {
                try {
                    const url = new URL(tabs[0].url);
                    resolve(url.hostname);
                } catch {
                    resolve('');
                }
            } else {
                resolve('');
            }
        });
    });
}

// ============================================================================
// Initialize
// ============================================================================

async function init() {
    // Get current tab hostname
    currentHostname = await getCurrentTabHostname();
    document.getElementById('currentSite').textContent = currentHostname || '알 수 없음';

    // Load and apply settings
    const settings = await loadSettings();
    updateUI(settings);

    // Setup event listeners
    setupListeners();
}

document.addEventListener('DOMContentLoaded', init);
