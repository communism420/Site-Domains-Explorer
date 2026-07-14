"use strict";

const MESSAGE_DOMAINS_FOUND = "SDE_DOMAINS_FOUND";
const MESSAGE_FORCE_SCAN = "SDE_FORCE_SCAN";
const MESSAGE_REFRESH_CURRENT_TAB = "SDE_REFRESH_CURRENT_TAB";
const MESSAGE_GET_CURRENT_SITE_DATA = "SDE_GET_CURRENT_SITE_DATA";
const MESSAGE_GET_ALL_DATA = "SDE_GET_ALL_DATA";
const MESSAGE_CLEAR_ALL_DATA = "SDE_CLEAR_ALL_DATA";
const MESSAGE_GET_COLLECTION_STATE = "SDE_GET_COLLECTION_STATE";
const MESSAGE_SET_COLLECTION_STATE = "SDE_SET_COLLECTION_STATE";
const MESSAGE_COLLECTION_STATE_CHANGED = "SDE_COLLECTION_STATE_CHANGED";
const MESSAGE_SITE_DATA_UPDATED = "SDE_SITE_DATA_UPDATED";

const CONSENT_STORAGE_KEY = "__sde_consent";
const FLUSH_DELAY_MS = 100;
const WEB_REQUEST_FILTER = { urls: ["<all_urls>"] };
const SUPPORTED_NETWORK_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);
const COMMON_SECOND_LEVEL_SUFFIXES = new Set([
  "ac.uk",
  "co.il",
  "co.in",
  "co.jp",
  "co.kr",
  "co.nz",
  "co.uk",
  "co.za",
  "com.ar",
  "com.au",
  "com.br",
  "com.cn",
  "com.mx",
  "com.tr",
  "com.ua",
  "edu.au",
  "gov.uk",
  "net.au",
  "net.cn",
  "org.au",
  "org.uk"
]);

const pendingUpdates = new Map();
const flushTimers = new Map();
const liveDomainsBySite = new Map();
const tabSiteKeys = new Map();
const tabSiteKeyLookups = new Map();

let dataCollectionEnabled = false;
let siteDataResetInProgress = false;
let storageWriteQueue = Promise.resolve();
let clearSiteDataPromise = null;

const privacyReady = initializePrivacyState();

async function initializePrivacyState() {
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch (error) {
    console.warn("Site Domains Explorer: could not restrict storage access", error);
  }

  const items = await chrome.storage.local.get(CONSENT_STORAGE_KEY);
  dataCollectionEnabled = items[CONSENT_STORAGE_KEY] === true;
  return dataCollectionEnabled;
}

function t(messageName, substitutions) {
  return chrome.i18n.getMessage(messageName, substitutions) || messageName;
}

function errorResponse(messageName) {
  return {
    ok: false,
    errorKey: messageName,
    error: t(messageName)
  };
}

function normalizeHostname(hostname) {
  if (!hostname || typeof hostname !== "string") {
    return "";
  }

  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function hostnameFromUrl(url) {
  try {
    const parsed = new URL(url);

    if (!SUPPORTED_NETWORK_PROTOCOLS.has(parsed.protocol)) {
      return "";
    }

    return normalizeHostname(parsed.hostname);
  } catch (_error) {
    return "";
  }
}

function isIpAddress(hostname) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":");
}

function getPrimaryHostname(hostname) {
  const normalized = normalizeHostname(hostname).replace(/^www\./, "");

  if (!normalized || normalized === "localhost" || isIpAddress(normalized)) {
    return normalized;
  }

  const parts = normalized.split(".").filter(Boolean);

  if (parts.length <= 2) {
    return normalized;
  }

  const lastTwo = parts.slice(-2).join(".");

  if (COMMON_SECOND_LEVEL_SUFFIXES.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }

  return parts.slice(-2).join(".");
}

function siteKeyFromUrl(url) {
  return getPrimaryHostname(hostnameFromUrl(url));
}

function uniqueHostnames(values) {
  const result = new Set();

  for (const value of values || []) {
    const hostname = normalizeHostname(value);

    if (hostname) {
      result.add(hostname);
    }
  }

  return Array.from(result);
}

function isSiteRecord(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray(value.domains) &&
      typeof value.lastVisited === "number" &&
      typeof value.visitCount === "number"
  );
}

function rememberLiveDomains(siteKey, domains) {
  const knownDomains = liveDomainsBySite.get(siteKey) || new Set();
  const addedDomains = [];

  for (const domain of domains) {
    if (!knownDomains.has(domain)) {
      knownDomains.add(domain);
      addedDomains.push(domain);
    }
  }

  liveDomainsBySite.set(siteKey, knownDomains);
  return addedDomains;
}

function publishLiveSiteUpdate(siteKey, domains, lastVisited, visitCountDelta, observedAt) {
  if (domains.length === 0 && !lastVisited && !visitCountDelta) {
    return;
  }

  chrome.runtime
    .sendMessage({
      type: MESSAGE_SITE_DATA_UPDATED,
      siteKey,
      domains,
      lastVisited,
      visitCountDelta,
      observedAt
    })
    .catch(() => {
      // No extension view is currently open to receive this live update.
    });
}

function queueSiteUpdate(siteKey, domains, options = {}) {
  if (!dataCollectionEnabled || siteDataResetInProgress) {
    return;
  }

  const normalizedSiteKey = getPrimaryHostname(siteKey);
  const normalizedDomains = uniqueHostnames([normalizedSiteKey, ...domains]);

  if (!normalizedSiteKey || normalizedDomains.length === 0) {
    return;
  }

  const current = pendingUpdates.get(normalizedSiteKey) || {
    domains: new Set(),
    lastVisited: 0,
    visitIncrement: 0
  };
  const observedAt = Date.now();
  const addedDomains = rememberLiveDomains(normalizedSiteKey, normalizedDomains);

  for (const domain of normalizedDomains) {
    current.domains.add(domain);
  }

  if (options.touch !== false) {
    current.lastVisited = Math.max(current.lastVisited, observedAt);
  }

  if (options.incrementVisit) {
    current.visitIncrement += 1;
  }

  pendingUpdates.set(normalizedSiteKey, current);
  publishLiveSiteUpdate(
    normalizedSiteKey,
    addedDomains,
    options.touch !== false ? current.lastVisited : 0,
    options.incrementVisit ? 1 : 0,
    observedAt
  );
  scheduleFlush(normalizedSiteKey);
}

function scheduleFlush(siteKey) {
  if (flushTimers.has(siteKey)) {
    return;
  }

  flushTimers.set(
    siteKey,
    setTimeout(() => {
      flushTimers.delete(siteKey);
      void flushSiteUpdate(siteKey);
    }, FLUSH_DELAY_MS)
  );
}

function flushSiteUpdate(siteKey) {
  const scheduledTimer = flushTimers.get(siteKey);

  if (scheduledTimer) {
    clearTimeout(scheduledTimer);
    flushTimers.delete(siteKey);
  }

  const update = pendingUpdates.get(siteKey);

  if (!update) {
    return storageWriteQueue;
  }

  pendingUpdates.delete(siteKey);

  storageWriteQueue = storageWriteQueue
    .then(async () => {
      if (!dataCollectionEnabled || siteDataResetInProgress) {
        return;
      }

      const existingItems = await chrome.storage.local.get(siteKey);
      const existing = isSiteRecord(existingItems[siteKey])
        ? existingItems[siteKey]
        : { domains: [], lastVisited: 0, visitCount: 0 };

      const mergedDomains = new Set([
        ...existing.domains.map(normalizeHostname).filter(Boolean),
        ...Array.from(update.domains)
      ]);
      const nextLastVisited =
        update.lastVisited > 0
          ? Math.max(existing.lastVisited || 0, update.lastVisited)
          : existing.lastVisited || 0;

      if (!dataCollectionEnabled || siteDataResetInProgress) {
        return;
      }

      const record = {
        domains: Array.from(mergedDomains).sort((a, b) => a.localeCompare(b)),
        lastVisited: nextLastVisited,
        visitCount: Math.max(0, existing.visitCount || 0) + update.visitIncrement
      };

      rememberLiveDomains(siteKey, record.domains);
      await chrome.storage.local.set({ [siteKey]: record });
    })
    .catch((error) => {
      console.warn("Site Domains Explorer: failed to write storage record", error);
    });

  return storageWriteQueue;
}

async function flushAllUpdates() {
  const siteKeys = Array.from(pendingUpdates.keys());
  await Promise.all(siteKeys.map((siteKey) => flushSiteUpdate(siteKey)));
}

function discardPendingUpdates() {
  for (const timer of flushTimers.values()) {
    clearTimeout(timer);
  }

  flushTimers.clear();
  pendingUpdates.clear();
}

async function resolveTabSiteKey(tabId) {
  const knownSiteKey = tabSiteKeys.get(tabId);

  if (knownSiteKey) {
    return knownSiteKey;
  }

  if (tabSiteKeyLookups.has(tabId)) {
    return tabSiteKeyLookups.get(tabId);
  }

  const lookup = chrome.tabs
    .get(tabId)
    .then((tab) => {
      const currentSiteKey = tabSiteKeys.get(tabId);

      if (currentSiteKey) {
        return currentSiteKey;
      }

      const siteKey = siteKeyFromUrl(tab.url);

      if (siteKey) {
        tabSiteKeys.set(tabId, siteKey);
      }

      return siteKey;
    })
    .catch(() => "")
    .finally(() => {
      tabSiteKeyLookups.delete(tabId);
    });

  tabSiteKeyLookups.set(tabId, lookup);
  return lookup;
}

async function collectRequest(details) {
  const requestHostname = hostnameFromUrl(details.url);

  if (!requestHostname) {
    return;
  }

  let siteKey = "";

  if (details.tabId >= 0 && details.type === "main_frame") {
    siteKey = getPrimaryHostname(requestHostname);
    tabSiteKeys.set(details.tabId, siteKey);
    tabSiteKeyLookups.delete(details.tabId);
  } else if (details.tabId >= 0) {
    siteKey = await resolveTabSiteKey(details.tabId);
  }

  if (!siteKey) {
    siteKey =
      siteKeyFromUrl(details.initiator) ||
      siteKeyFromUrl(details.documentUrl) ||
      siteKeyFromUrl(details.originUrl);
  }

  if (siteKey) {
    queueSiteUpdate(siteKey, [requestHostname], { touch: false, incrementVisit: false });
  }
}

async function handleWebRequest(details) {
  try {
    await privacyReady;

    if (dataCollectionEnabled) {
      await collectRequest(details);
    }
  } catch (error) {
    console.warn("Site Domains Explorer: failed to process a network request", error);
  }
}

async function rescanTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: MESSAGE_FORCE_SCAN });
    return { ok: true, response };
  } catch (_error) {
    return { ok: false, response: null };
  }
}

async function handleNavigation(details) {
  await privacyReady;

  if (!dataCollectionEnabled || details.frameId !== 0) {
    return;
  }

  const siteKey = siteKeyFromUrl(details.url);
  const pageHostname = hostnameFromUrl(details.url);

  if (!siteKey || !pageHostname) {
    tabSiteKeys.delete(details.tabId);
    return;
  }

  tabSiteKeys.set(details.tabId, siteKey);
  queueSiteUpdate(siteKey, [pageHostname], {
    touch: true,
    incrementVisit: true
  });

  const scanResult = await rescanTab(details.tabId);

  if (Array.isArray(scanResult.response?.domains)) {
    queueSiteUpdate(siteKey, scanResult.response.domains, {
      touch: false,
      incrementVisit: false
    });
  }

  await flushSiteUpdate(siteKey);
}

async function getAllSiteData() {
  if (dataCollectionEnabled) {
    await flushAllUpdates();
  }

  const items = await chrome.storage.local.get(null);
  const result = {};

  for (const [key, value] of Object.entries(items)) {
    if (isSiteRecord(value)) {
      result[key] = value;
      rememberLiveDomains(key, value.domains);
    }
  }

  return result;
}

async function getCurrentTabContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || typeof tab.id !== "number" || !tab.url) {
    return errorResponse("errorCannotDetermineTab");
  }

  const siteKey = siteKeyFromUrl(tab.url);
  const pageHostname = hostnameFromUrl(tab.url);

  if (!siteKey || !pageHostname) {
    return errorResponse("errorUnsupportedPage");
  }

  return { ok: true, tab, siteKey, pageHostname };
}

async function getCurrentSiteData(options = {}) {
  if (!dataCollectionEnabled) {
    return errorResponse("consentRequired");
  }

  const context = await getCurrentTabContext();

  if (!context.ok) {
    return context;
  }

  const { tab, siteKey, pageHostname } = context;
  tabSiteKeys.set(tab.id, siteKey);
  queueSiteUpdate(siteKey, [pageHostname], {
    touch: options.touch === true,
    incrementVisit: false
  });

  const scanResult = options.forceScan ? await rescanTab(tab.id) : { ok: false, response: null };

  if (Array.isArray(scanResult.response?.domains)) {
    queueSiteUpdate(siteKey, scanResult.response.domains, {
      touch: options.touch === true,
      incrementVisit: false
    });
  }

  await flushSiteUpdate(siteKey);

  const items = await chrome.storage.local.get(siteKey);
  const record = isSiteRecord(items[siteKey])
    ? items[siteKey]
    : {
        domains: [pageHostname],
        lastVisited: options.touch === true ? Date.now() : 0,
        visitCount: 0
      };

  rememberLiveDomains(siteKey, record.domains);

  return {
    ok: true,
    siteKey,
    pageHostname,
    record,
    contentScriptResponded: scanResult.ok
  };
}

async function clearAllSiteData() {
  if (!clearSiteDataPromise) {
    clearSiteDataPromise = (async () => {
      siteDataResetInProgress = true;
      discardPendingUpdates();
      liveDomainsBySite.clear();

      try {
        await storageWriteQueue;

        const items = await chrome.storage.local.get(null);
        const keys = Object.entries(items)
          .filter(([, value]) => isSiteRecord(value))
          .map(([key]) => key);

        if (keys.length > 0) {
          await chrome.storage.local.remove(keys);
        }

        // A write that was already past its final guard can finish while the reset
        // is starting. Clear the live cache again after all writes and removals.
        liveDomainsBySite.clear();

        return keys.length;
      } finally {
        siteDataResetInProgress = false;
      }
    })().finally(() => {
      clearSiteDataPromise = null;
    });
  }

  return clearSiteDataPromise;
}

async function notifyCollectionStateChanged(enabled) {
  const tabs = await chrome.tabs.query({});

  await Promise.all(
    tabs.map(async (tab) => {
      if (typeof tab.id !== "number") {
        return;
      }

      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: MESSAGE_COLLECTION_STATE_CHANGED,
          enabled
        });
      } catch (_error) {
        // Restricted pages and tabs without a content script cannot receive messages.
      }
    })
  );
}

async function setCollectionEnabled(enabled) {
  if (enabled) {
    await chrome.storage.local.set({ [CONSENT_STORAGE_KEY]: true });
    dataCollectionEnabled = true;
  } else {
    dataCollectionEnabled = false;
    discardPendingUpdates();
    tabSiteKeys.clear();
    await storageWriteQueue;
    await chrome.storage.local.set({ [CONSENT_STORAGE_KEY]: false });
  }

  await notifyCollectionStateChanged(enabled);
  return enabled;
}

async function refreshCurrentTab() {
  return getCurrentSiteData({ forceScan: true, touch: true });
}

async function handleMessage(message, sender) {
  await privacyReady;

  if (!message || typeof message !== "object") {
    return errorResponse("errorInvalidMessage");
  }

  if (message.type === MESSAGE_GET_COLLECTION_STATE) {
    return { ok: true, enabled: dataCollectionEnabled };
  }

  if (message.type === MESSAGE_SET_COLLECTION_STATE) {
    if (typeof message.enabled !== "boolean") {
      return errorResponse("errorInvalidMessage");
    }

    return { ok: true, enabled: await setCollectionEnabled(message.enabled) };
  }

  if (message.type === MESSAGE_DOMAINS_FOUND) {
    if (!dataCollectionEnabled) {
      return errorResponse("consentRequired");
    }

    const tabUrl = sender?.tab?.url || "";
    const siteKey = siteKeyFromUrl(tabUrl) || siteKeyFromUrl(message.pageUrl);
    const pageHostname = hostnameFromUrl(tabUrl) || hostnameFromUrl(message.pageUrl);
    const domains = uniqueHostnames([pageHostname, ...(message.domains || [])]);

    if (siteKey && domains.length > 0) {
      queueSiteUpdate(siteKey, domains, { touch: false, incrementVisit: false });
      return { ok: true, siteKey };
    }

    return errorResponse("errorNoPageDomain");
  }

  if (message.type === MESSAGE_REFRESH_CURRENT_TAB) {
    return refreshCurrentTab();
  }

  if (message.type === MESSAGE_GET_CURRENT_SITE_DATA) {
    return getCurrentSiteData({ forceScan: true, touch: false });
  }

  if (message.type === MESSAGE_GET_ALL_DATA) {
    return { ok: true, data: await getAllSiteData() };
  }

  if (message.type === MESSAGE_CLEAR_ALL_DATA) {
    const removed = await clearAllSiteData();
    return { ok: true, removed };
  }

  return errorResponse("errorUnknownMessage");
}

async function handleInstalled() {
  await privacyReady;
  const items = await chrome.storage.local.get(CONSENT_STORAGE_KEY);

  if (typeof items[CONSENT_STORAGE_KEY] === "boolean") {
    return;
  }

  dataCollectionEnabled = false;
  await chrome.storage.local.set({ [CONSENT_STORAGE_KEY]: false });
  await chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console.warn("Site Domains Explorer: message handling failed", error);
      sendResponse({
        ok: false,
        errorKey: "errorInternal",
        error: error.message || t("errorInternal")
      });
    });

  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  void handleInstalled().catch((error) => {
    console.warn("Site Domains Explorer: first-run setup failed", error);
  });
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    void handleWebRequest(details);
  },
  WEB_REQUEST_FILTER
);

chrome.webNavigation.onCommitted.addListener((details) => {
  void handleNavigation(details);
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  void handleNavigation(details);
});

chrome.webNavigation.onReferenceFragmentUpdated.addListener((details) => {
  void handleNavigation(details);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabSiteKeys.delete(tabId);
  tabSiteKeyLookups.delete(tabId);
});
