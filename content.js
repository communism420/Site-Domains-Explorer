"use strict";

const MESSAGE_DOMAINS_FOUND = "SDE_DOMAINS_FOUND";
const MESSAGE_FORCE_SCAN = "SDE_FORCE_SCAN";
const MESSAGE_GET_COLLECTION_STATE = "SDE_GET_COLLECTION_STATE";
const MESSAGE_COLLECTION_STATE_CHANGED = "SDE_COLLECTION_STATE_CHANGED";
const PAGE_OBSERVER_CHANNEL = "__site_domains_explorer_network_v1__";

const ATTRIBUTE_URL_NAMES = new Set([
  "action",
  "archive",
  "background",
  "cite",
  "codebase",
  "data",
  "formaction",
  "href",
  "icon",
  "longdesc",
  "manifest",
  "poster",
  "profile",
  "src",
  "xlink:href"
]);
const MULTI_URL_ATTRIBUTE_NAMES = new Set(["archive", "ping"]);
const SRCSET_ATTRIBUTE_NAMES = new Set(["imagesrcset", "srcset"]);
const OBSERVED_ATTRIBUTE_NAMES = Array.from(
  new Set([
    ...ATTRIBUTE_URL_NAMES,
    ...MULTI_URL_ATTRIBUTE_NAMES,
    ...SRCSET_ATTRIBUTE_NAMES,
    "style"
  ])
);
const SUPPORTED_URL_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);

const collectedHostnames = new Set();
const pendingHostnames = new Set();
const delayedScanTimers = new Set();

let collectionEnabled = false;
let flushScheduled = false;
let supplementalScanTimer = null;
let navigationTimer = null;
let mutationRetryTimer = null;
let mutationObserver = null;
let performanceObserver = null;
let lastObservedUrl = location.href;

function normalizeHostname(hostname) {
  return (hostname || "").trim().toLowerCase().replace(/\.$/, "");
}

function addHostname(hostname) {
  if (!collectionEnabled) {
    return;
  }

  const normalized = normalizeHostname(hostname);

  if (!normalized || collectedHostnames.has(normalized)) {
    return;
  }

  collectedHostnames.add(normalized);
  pendingHostnames.add(normalized);
  scheduleFlush();
}

function notifyPageObserver() {
  window.postMessage(
    {
      channel: PAGE_OBSERVER_CHANNEL,
      type: "collection-state",
      enabled: collectionEnabled
    },
    "*"
  );
}

function addPageObserverHostname(hostname) {
  if (!collectionEnabled || typeof hostname !== "string") {
    return;
  }

  const normalized = normalizeHostname(hostname);

  try {
    const parsed = new URL(`https://${normalized}/`);

    if (normalizeHostname(parsed.hostname) === normalized) {
      addHostname(normalized);
    }
  } catch (_error) {
    // Ignore page messages that are not valid standalone hostnames.
  }
}

function addUrlCandidate(rawValue, baseUrl = document.baseURI || location.href) {
  if (!collectionEnabled || !rawValue || typeof rawValue !== "string") {
    return;
  }

  const value = rawValue.trim();

  if (!value || value.startsWith("#")) {
    return;
  }

  try {
    const url = new URL(value, baseUrl);

    if (SUPPORTED_URL_PROTOCOLS.has(url.protocol) && url.hostname) {
      addHostname(url.hostname);
    }
  } catch (_error) {
    // Malformed URLs and non-URL attribute values are not domain candidates.
  }
}

function addMultiUrlCandidates(rawValue, baseUrl) {
  for (const candidate of (rawValue || "").trim().split(/\s+/)) {
    addUrlCandidate(candidate, baseUrl);
  }
}

function addSrcsetCandidates(srcsetValue, baseUrl) {
  if (!srcsetValue || typeof srcsetValue !== "string") {
    return;
  }

  for (const part of srcsetValue.split(",")) {
    const candidate = part.trim().split(/\s+/)[0];
    addUrlCandidate(candidate, baseUrl);
  }
}

function addStyleUrlCandidates(styleValue, baseUrl) {
  if (!styleValue || typeof styleValue !== "string") {
    return;
  }

  const urlPattern = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
  let match = urlPattern.exec(styleValue);

  while (match) {
    addUrlCandidate(match[2], baseUrl);
    match = urlPattern.exec(styleValue);
  }
}

function addMetaContentCandidate(element) {
  if (!(element instanceof HTMLMetaElement)) {
    return;
  }

  const content = element.getAttribute("content") || "";

  if (/^\s*https?:\/\//i.test(content)) {
    addUrlCandidate(content);
    return;
  }

  const refreshUrl = content.match(/url\s*=\s*([^;]+)/i);

  if (refreshUrl) {
    addUrlCandidate(refreshUrl[1].trim().replace(/^['"]|['"]$/g, ""));
  }
}

function scanElement(element) {
  if (!collectionEnabled || !(element instanceof Element)) {
    return;
  }

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;

    if (MULTI_URL_ATTRIBUTE_NAMES.has(name)) {
      addMultiUrlCandidates(value);
    } else if (ATTRIBUTE_URL_NAMES.has(name) || name.endsWith(":href")) {
      addUrlCandidate(value);
    } else if (SRCSET_ATTRIBUTE_NAMES.has(name)) {
      addSrcsetCandidates(value);
    } else if (name === "style") {
      addStyleUrlCandidates(value);
    }
  }

  addMetaContentCandidate(element);
}

function scanDomTree(root = document) {
  if (!collectionEnabled) {
    return;
  }

  if (root instanceof Element) {
    scanElement(root);
  }

  const elements = root.querySelectorAll ? root.querySelectorAll("*") : [];

  for (const element of elements) {
    scanElement(element);

    if (element.shadowRoot) {
      scanDomTree(element.shadowRoot);
    }
  }
}

function scanPerformanceEntries() {
  if (!collectionEnabled) {
    return;
  }

  try {
    for (const entry of performance.getEntriesByType("resource")) {
      addUrlCandidate(entry.name);
    }

    const navigationEntry = performance.getEntriesByType("navigation")[0];

    if (navigationEntry?.name) {
      addUrlCandidate(navigationEntry.name);
    }
  } catch (_error) {
    // DOM scanning and webRequest collection remain available on restricted pages.
  }
}

function scanCssRuleList(rules, baseUrl) {
  for (const rule of Array.from(rules || [])) {
    addStyleUrlCandidates(rule.cssText, baseUrl);

    if (rule.cssRules) {
      scanCssRuleList(rule.cssRules, baseUrl);
    }
  }
}

function scanStylesheets() {
  if (!collectionEnabled) {
    return;
  }

  const stylesheets = new Set([
    ...Array.from(document.styleSheets || []),
    ...Array.from(document.adoptedStyleSheets || [])
  ]);

  for (const stylesheet of stylesheets) {
    const baseUrl = stylesheet.href || document.baseURI || location.href;

    if (stylesheet.href) {
      addUrlCandidate(stylesheet.href);
    }

    try {
      scanCssRuleList(stylesheet.cssRules, baseUrl);
    } catch (_error) {
      // Browsers intentionally block cssRules for cross-origin stylesheets.
    }
  }
}

function collectNow(reason = "scan") {
  if (!collectionEnabled) {
    return;
  }

  addUrlCandidate(location.href);
  scanPerformanceEntries();
  scanDomTree(document);
  scanStylesheets();

  if (reason === "navigation") {
    lastObservedUrl = location.href;
  }
}

function collectSupplementalEntries() {
  if (!collectionEnabled) {
    return;
  }

  addUrlCandidate(location.href);
  scanPerformanceEntries();
  scanStylesheets();
}

function scheduleSupplementalScan() {
  if (supplementalScanTimer || !collectionEnabled) {
    return;
  }

  supplementalScanTimer = setTimeout(() => {
    supplementalScanTimer = null;
    collectSupplementalEntries();
  }, 25);
}

function scheduleFlush() {
  if (flushScheduled || !collectionEnabled) {
    return;
  }

  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    flushPendingHostnames();
  });
}

function flushPendingHostnames() {
  flushScheduled = false;

  if (!collectionEnabled || pendingHostnames.size === 0) {
    return;
  }

  const domains = Array.from(pendingHostnames);
  pendingHostnames.clear();

  chrome.runtime
    .sendMessage({
      type: MESSAGE_DOMAINS_FOUND,
      pageUrl: location.href,
      domains
    })
    .catch(() => {
      // Navigation or extension shutdown can invalidate the current context.
    });
}

function installPerformanceObserver() {
  if (!("PerformanceObserver" in window) || performanceObserver) {
    return;
  }

  try {
    performanceObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        addUrlCandidate(entry.name);
      }
    });
    performanceObserver.observe({ type: "resource", buffered: true });
  } catch (_error) {
    performanceObserver = null;
  }
}

function installMutationObserver() {
  if (mutationObserver) {
    return;
  }

  const start = () => {
    if (!collectionEnabled || !document.documentElement) {
      return false;
    }

    mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          scanElement(mutation.target);
          continue;
        }

        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            scanDomTree(node);
          }
        }
      }

      scheduleSupplementalScan();
    });

    mutationObserver.observe(document.documentElement, {
      attributeFilter: OBSERVED_ATTRIBUTE_NAMES,
      attributes: true,
      childList: true,
      subtree: true
    });

    return true;
  };

  if (!start() && !mutationRetryTimer) {
    mutationRetryTimer = setInterval(() => {
      if (start()) {
        clearInterval(mutationRetryTimer);
        mutationRetryTimer = null;
      }
    }, 50);
  }
}

function handlePossibleNavigationChange() {
  if (!collectionEnabled || lastObservedUrl === location.href) {
    return;
  }

  lastObservedUrl = location.href;
  collectNow("navigation");
}

function scheduleDelayedScan(delay) {
  const timer = setTimeout(() => {
    delayedScanTimers.delete(timer);
    collectNow(`late-${delay}`);
  }, delay);

  delayedScanTimers.add(timer);
}

function startCollection() {
  if (collectionEnabled) {
    return;
  }

  collectionEnabled = true;
  notifyPageObserver();
  lastObservedUrl = location.href;
  installPerformanceObserver();
  installMutationObserver();
  collectNow("initial");

  scheduleDelayedScan(1000);
  scheduleDelayedScan(3000);
  scheduleDelayedScan(8000);

  navigationTimer = setInterval(handlePossibleNavigationChange, 500);
}

function stopCollection() {
  collectionEnabled = false;
  notifyPageObserver();

  flushScheduled = false;

  if (supplementalScanTimer) {
    clearTimeout(supplementalScanTimer);
    supplementalScanTimer = null;
  }

  if (navigationTimer) {
    clearInterval(navigationTimer);
    navigationTimer = null;
  }

  if (mutationRetryTimer) {
    clearInterval(mutationRetryTimer);
    mutationRetryTimer = null;
  }

  for (const timer of delayedScanTimers) {
    clearTimeout(timer);
  }

  delayedScanTimers.clear();
  mutationObserver?.disconnect();
  performanceObserver?.disconnect();
  mutationObserver = null;
  performanceObserver = null;
  pendingHostnames.clear();
  collectedHostnames.clear();
}

window.addEventListener("hashchange", handlePossibleNavigationChange);
window.addEventListener("popstate", handlePossibleNavigationChange);
window.addEventListener("pageshow", () => collectNow("pageshow"));
window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.channel !== PAGE_OBSERVER_CHANNEL) {
    return;
  }

  if (event.data.type === "observer-ready") {
    notifyPageObserver();
  } else if (event.data.type === "hostname") {
    addPageObserverHostname(event.data.hostname);
  }
});
window.addEventListener("pagehide", flushPendingHostnames);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushPendingHostnames();
  }
});
document.addEventListener("DOMContentLoaded", () => collectNow("dom-ready"), { once: true });
window.addEventListener("load", () => collectNow("load"), { once: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_FORCE_SCAN) {
    if (!collectionEnabled) {
      sendResponse({ ok: false, errorKey: "consentRequired", domains: [] });
      return true;
    }

    collectNow("manual");
    flushPendingHostnames();
    sendResponse({ ok: true, domains: Array.from(collectedHostnames) });
    return true;
  }

  if (message?.type === MESSAGE_COLLECTION_STATE_CHANGED) {
    if (message.enabled === true) {
      startCollection();
    } else {
      stopCollection();
    }

    sendResponse({ ok: true });
    return true;
  }

  return false;
});

chrome.runtime
  .sendMessage({ type: MESSAGE_GET_COLLECTION_STATE })
  .then((response) => {
    if (response?.ok && response.enabled === true) {
      startCollection();
    }
  })
  .catch(() => {
    // Collection remains disabled if the background worker is unavailable.
  });
