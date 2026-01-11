// popup.js - Settings management with permission request

const DEFAULT_SETTINGS = {
    previewMode: false,
    disabledDomains: []
};

function normalizeHost(host) {
    return (host || "").toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
}

async function getActiveTabHost() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return "";
    try {
        return normalizeHost(new URL(tab.url).hostname);
    } catch {
        return "";
    }
}

function setStatus(text) {
    const el = document.getElementById("status");
    if (el) el.textContent = text || "";
}

async function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => resolve(items || DEFAULT_SETTINGS));
    });
}

async function saveSettings(settings) {
    return new Promise((resolve) => {
        chrome.storage.sync.set(settings, () => resolve());
    });
}

async function requestAllHostsPermission() {
    return new Promise((resolve) => {
        chrome.permissions.request(
            { origins: ["<all_urls>"] },
            (granted) => resolve(!!granted)
        );
    });
}

async function hasAllHostsPermission() {
    return new Promise((resolve) => {
        chrome.permissions.contains(
            { origins: ["<all_urls>"] },
            (result) => resolve(!!result)
        );
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    const togglePreview = document.getElementById("togglePreview");
    const toggleSite = document.getElementById("toggleSite");

    let settings = await loadSettings();
    const perm = await hasAllHostsPermission();
    const currentHost = await getActiveTabHost();

    // If permission was removed, force previewMode off
    if (settings.previewMode && !perm) {
        settings.previewMode = false;
        await saveSettings(settings);
    }

    // Update UI
    togglePreview.checked = !!settings.previewMode;

    const isDisabled = (settings.disabledDomains || []).map(normalizeHost).includes(currentHost);
    toggleSite.checked = !isDisabled;

    if (settings.previewMode) {
        setStatus("✅ 미리보기 모드 활성화");
    } else {
        setStatus("⏸️ 미리보기 모드 비활성화");
    }

    // Preview Mode toggle
    togglePreview.addEventListener("change", async () => {
        settings = await loadSettings();

        if (togglePreview.checked) {
            // Request permission
            const granted = await requestAllHostsPermission();
            if (!granted) {
                togglePreview.checked = false;
                settings.previewMode = false;
                await saveSettings(settings);
                setStatus("❌ 권한이 거부되었습니다");
                return;
            }
            settings.previewMode = true;
            await saveSettings(settings);
            setStatus("✅ 미리보기 모드 활성화");
        } else {
            settings.previewMode = false;
            await saveSettings(settings);
            setStatus("⏸️ 미리보기 모드 비활성화");
        }
    });

    // Site toggle
    toggleSite.addEventListener("change", async () => {
        settings = await loadSettings();

        if (!currentHost) {
            setStatus("현재 사이트를 감지할 수 없습니다");
            return;
        }

        let list = (settings.disabledDomains || []).map(normalizeHost);

        if (toggleSite.checked) {
            // Enable on this site (remove from disabled list)
            list = list.filter((d) => d !== currentHost);
            setStatus(`✅ ${currentHost}에서 활성화`);
        } else {
            // Disable on this site
            if (!list.includes(currentHost)) {
                list.push(currentHost);
            }
            setStatus(`⏸️ ${currentHost}에서 비활성화`);
        }

        settings.disabledDomains = list;
        await saveSettings(settings);
    });
});
