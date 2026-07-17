"use strict";

const webExtensionApi = globalThis.browser ?? globalThis.chrome;

const MESSAGE_GET_ALL_DATA = "SDE_GET_ALL_DATA";
const MESSAGE_CLEAR_ALL_DATA = "SDE_CLEAR_ALL_DATA";
const MESSAGE_GET_COLLECTION_STATE = "SDE_GET_COLLECTION_STATE";
const MESSAGE_SITE_DATA_UPDATED = "SDE_SITE_DATA_UPDATED";
const LANGUAGE_STORAGE_KEY = "__sde_language";
const CONSENT_STORAGE_KEY = "__sde_consent";
const DEFAULT_LOCALE = "en";
const SUPPORTED_LOCALES = new Set(["en", "es", "de", "pt_BR", "ru", "uk", "fr"]);

const elements = {
  cancelClearHistoryButton: document.getElementById("cancelClearHistoryButton"),
  clearHistoryButton: document.getElementById("clearHistoryButton"),
  clearHistoryDialog: document.getElementById("clearHistoryDialog"),
  confirmClearHistoryButton: document.getElementById("confirmClearHistoryButton"),
  emptyHint: document.getElementById("emptyHint"),
  emptyState: document.getElementById("emptyState"),
  emptyTitle: document.getElementById("emptyTitle"),
  liveState: document.getElementById("liveState"),
  liveStateText: document.getElementById("liveStateText"),
  resultsCount: document.getElementById("resultsCount"),
  siteSearchInput: document.getElementById("siteSearchInput"),
  sitesList: document.getElementById("sitesList"),
  statusText: document.getElementById("statusText")
};

let activeLocale = DEFAULT_LOCALE;
let activeMessages = {};
let collectionEnabled = false;
let renderFrameId = 0;
let siteData = {};
const expandedSiteKeys = new Set();

function t(messageName, substitutions) {
  const template =
    activeMessages[messageName]?.message ||
    webExtensionApi.i18n.getMessage(messageName) ||
    messageName;
  const values = Array.isArray(substitutions)
    ? substitutions
    : substitutions === undefined
      ? []
      : [substitutions];

  return values.reduce(
    (message, value, index) => message.replaceAll(`$${index + 1}`, String(value)),
    template
  );
}

function getBrowserLocale() {
  const normalized = webExtensionApi.i18n.getUILanguage().replace("-", "_");
  const baseLocale = normalized.split("_")[0];

  if (SUPPORTED_LOCALES.has(normalized)) {
    return normalized;
  }

  return SUPPORTED_LOCALES.has(baseLocale) ? baseLocale : DEFAULT_LOCALE;
}

function getIntlLocale() {
  return activeLocale.replace("_", "-");
}

async function loadMessages(locale) {
  const response = await fetch(webExtensionApi.runtime.getURL(`_locales/${locale}/messages.json`));

  if (!response.ok) {
    throw new Error(`Failed to load locale: ${locale}`);
  }

  return response.json();
}

async function getPreferredLocale() {
  const items = await webExtensionApi.storage.local.get(LANGUAGE_STORAGE_KEY);
  const savedLocale = items[LANGUAGE_STORAGE_KEY];

  return SUPPORTED_LOCALES.has(savedLocale) ? savedLocale : getBrowserLocale();
}

async function setActiveLocale(locale) {
  activeLocale = SUPPORTED_LOCALES.has(locale) ? locale : DEFAULT_LOCALE;
  activeMessages = await loadMessages(activeLocale);
  document.documentElement.lang = getIntlLocale();
  document.title = `${t("allSitesTitle")} - ${t("extensionName")}`;

  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }

  for (const element of document.querySelectorAll("[data-i18n-placeholder]")) {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  }

  for (const element of document.querySelectorAll("[data-i18n-aria-label]")) {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  }

  updateLiveIndicator();
}

function formatVisitTime(timestamp) {
  if (!timestamp) {
    return t("noData");
  }

  return new Intl.DateTimeFormat(getIntlLocale(), {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(timestamp));
}

function setStatus(message, tone = "neutral") {
  elements.statusText.textContent = message || "";
  elements.statusText.dataset.tone = tone;
}

function getResponseError(response, fallbackKey) {
  if (response?.errorKey) {
    return t(response.errorKey);
  }

  return response?.error || t(fallbackKey);
}

function setSiteStatus(element, message, tone = "neutral") {
  element.textContent = message || "";
  element.dataset.tone = tone;
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

function updateLiveIndicator() {
  elements.liveState.dataset.active = String(collectionEnabled);
  elements.liveStateText.textContent = t(
    collectionEnabled ? "liveMonitoring" : "monitoringPaused"
  );
}

function scheduleRenderSites() {
  if (renderFrameId) {
    return;
  }

  renderFrameId = requestAnimationFrame(() => {
    renderFrameId = 0;
    renderSites();
  });
}

function applyLiveSiteUpdate(message) {
  if (!message.siteKey || typeof message.siteKey !== "string") {
    return;
  }

  const existing = isSiteRecord(siteData[message.siteKey])
    ? siteData[message.siteKey]
    : { domains: [], lastVisited: 0, visitCount: 0 };
  const domains = new Set(existing.domains);

  for (const domain of message.domains || []) {
    if (typeof domain === "string" && domain) {
      domains.add(domain);
    }
  }

  siteData[message.siteKey] = {
    domains: Array.from(domains),
    lastVisited: Math.max(existing.lastVisited || 0, message.lastVisited || 0),
    visitCount:
      Math.max(0, existing.visitCount || 0) + Math.max(0, message.visitCountDelta || 0)
  };
  scheduleRenderSites();
}

async function loadCollectionState() {
  const response = await webExtensionApi.runtime.sendMessage({ type: MESSAGE_GET_COLLECTION_STATE });

  if (!response?.ok) {
    throw new Error(getResponseError(response, "errorInternal"));
  }

  collectionEnabled = response.enabled === true;
  updateLiveIndicator();
}

function isFirstPartyDomain(domain, siteKey) {
  return domain === siteKey || domain.endsWith(`.${siteKey}`);
}

function sortDomains(domains) {
  return [...domains].sort((a, b) => a.localeCompare(b));
}

function getSortedSites() {
  return Object.entries(siteData)
    .filter(([, record]) => isSiteRecord(record))
    .map(([hostname, record]) => ({ hostname, ...record }))
    .sort((a, b) => (b.lastVisited || 0) - (a.lastVisited || 0));
}

function createDomainRow(domain) {
  const row = document.createElement("li");
  row.className = "domain-row";

  const name = document.createElement("span");
  name.className = "domain-name";
  name.textContent = domain;

  row.append(name);
  return row;
}

function createDomainGroup(titleKey, domains, className) {
  const group = document.createElement("section");
  group.className = `domain-group ${className}`;

  const heading = document.createElement("h2");
  heading.className = "domain-group-title";
  heading.textContent = t(titleKey, String(domains.length));

  group.append(heading);

  if (domains.length === 0) {
    const empty = document.createElement("p");
    empty.className = "domain-group-empty";
    empty.textContent = t("historyNoDomainsInCategory");
    group.append(empty);
    return group;
  }

  const list = document.createElement("ul");
  list.className = "domain-list";

  for (const domain of sortDomains(domains)) {
    list.append(createDomainRow(domain));
  }

  group.append(list);
  return group;
}

async function writeTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_error) {
      // Fall back when the asynchronous clipboard API is unavailable.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  document.body.append(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error(t("clipboardWriteFailed"));
  }
}

function createCopyButton(buttonKey, scopeLabelKey, domains, statusElement) {
  const button = document.createElement("button");
  button.className = "site-copy-button";
  button.type = "button";
  button.disabled = domains.length === 0;
  button.textContent = t(buttonKey, String(domains.length));

  button.addEventListener("click", async () => {
    if (domains.length === 0) {
      setSiteStatus(
        statusElement,
        t("noDomainsForScope", t(scopeLabelKey)),
        "warning"
      );
      return;
    }

    button.disabled = true;

    try {
      await writeTextToClipboard(sortDomains(domains).join("\n"));
      setSiteStatus(
        statusElement,
        t("copiedStatus", [t(scopeLabelKey), String(domains.length)]),
        "success"
      );
    } catch (error) {
      setSiteStatus(statusElement, error.message || t("copyFailed"), "error");
    } finally {
      button.disabled = domains.length === 0;
    }
  });

  return button;
}

function createSiteCopyPanel(firstPartyDomains, thirdPartyDomains) {
  const panel = document.createElement("section");
  panel.className = "site-copy-panel";

  const title = document.createElement("h2");
  title.className = "site-copy-title";
  title.textContent = t("copyActionsLabel");

  const actions = document.createElement("div");
  actions.className = "site-copy-actions";

  const status = document.createElement("p");
  status.className = "site-copy-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const allDomains = [...firstPartyDomains, ...thirdPartyDomains];
  actions.append(
    createCopyButton("copyOwnButton", "copyScopeFirstParty", firstPartyDomains, status),
    createCopyButton(
      "copyThirdPartyButton",
      "copyScopeThirdParty",
      thirdPartyDomains,
      status
    ),
    createCopyButton("copyAllButton", "copyScopeAll", allDomains, status)
  );

  panel.append(title, actions, status);
  return panel;
}

function createSiteItem(site) {
  const details = document.createElement("details");
  details.className = "site-item";
  details.dataset.siteKey = site.hostname;

  const summary = document.createElement("summary");

  const summaryMain = document.createElement("span");
  summaryMain.className = "site-summary-main";

  const hostname = document.createElement("strong");
  hostname.textContent = site.hostname;

  const metadata = document.createElement("span");
  metadata.className = "site-metadata";
  metadata.textContent = t("historySiteMeta", [
    String(site.domains.length),
    formatVisitTime(site.lastVisited),
    String(site.visitCount || 0)
  ]);

  const count = document.createElement("span");
  count.className = "domain-count";
  count.textContent = String(site.domains.length);

  summaryMain.append(hostname, metadata);
  summary.append(summaryMain, count);

  const body = document.createElement("div");
  body.className = "site-body";
  details.append(summary, body);

  let domainsRendered = false;
  const renderBody = () => {
    if (domainsRendered) {
      return;
    }

    const firstPartyDomains = site.domains.filter((domain) =>
      isFirstPartyDomain(domain, site.hostname)
    );
    const thirdPartyDomains = site.domains.filter((domain) =>
      !isFirstPartyDomain(domain, site.hostname)
    );

    body.append(
      createSiteCopyPanel(firstPartyDomains, thirdPartyDomains),
      createDomainGroup("historyOwnDomainsTitle", firstPartyDomains, "own-domains"),
      createDomainGroup("historyThirdPartyDomainsTitle", thirdPartyDomains, "third-party-domains")
    );

    domainsRendered = true;
  };

  details.addEventListener("toggle", () => {
    if (details.open) {
      expandedSiteKeys.add(site.hostname);
      renderBody();
    } else {
      expandedSiteKeys.delete(site.hostname);
    }
  });

  if (expandedSiteKeys.has(site.hostname)) {
    details.open = true;
    renderBody();
  }

  return details;
}

function renderSites() {
  const query = elements.siteSearchInput.value.trim().toLowerCase();
  const allSites = getSortedSites();
  const visibleSites = allSites.filter((site) => site.hostname.toLowerCase().includes(query));

  for (const siteKey of expandedSiteKeys) {
    if (!isSiteRecord(siteData[siteKey])) {
      expandedSiteKeys.delete(siteKey);
    }
  }

  elements.sitesList.replaceChildren();

  for (const site of visibleSites) {
    elements.sitesList.append(createSiteItem(site));
  }

  elements.resultsCount.textContent = t("historySitesCount", String(visibleSites.length));
  elements.clearHistoryButton.disabled = allSites.length === 0;
  elements.emptyState.classList.toggle("hidden", visibleSites.length > 0);

  if (visibleSites.length === 0) {
    const hasSavedSites = allSites.length > 0;
    elements.emptyTitle.textContent = t(hasSavedSites ? "historyNoResultsTitle" : "historyEmptyTitle");
    elements.emptyHint.textContent = t(hasSavedSites ? "historyNoResultsHint" : "historyEmptyHint");
  }
}

async function loadSites() {
  setStatus(t("historyLoading"));
  const response = await webExtensionApi.runtime.sendMessage({ type: MESSAGE_GET_ALL_DATA });

  if (!response?.ok) {
    const errorMessage = response?.errorKey ? t(response.errorKey) : response?.error;
    throw new Error(errorMessage || t("loadAllSitesFailed"));
  }

  siteData = response.data || {};
  renderSites();
  setStatus("");
}

function openClearHistoryDialog() {
  if (Object.keys(siteData).length === 0) {
    return;
  }

  elements.clearHistoryDialog.showModal();
}

async function clearAllHistory() {
  elements.cancelClearHistoryButton.disabled = true;
  elements.confirmClearHistoryButton.disabled = true;

  try {
    const response = await webExtensionApi.runtime.sendMessage({ type: MESSAGE_CLEAR_ALL_DATA });

    if (!response?.ok) {
      throw new Error(getResponseError(response, "clearAllDataFailed"));
    }

    siteData = {};
    elements.siteSearchInput.value = "";
    renderSites();
    elements.clearHistoryDialog.close();
    setStatus(t("recordsRemoved", String(response.removed || 0)), "success");
  } catch (error) {
    setStatus(error.message || t("clearAllDataFailed"), "error");
    elements.clearHistoryDialog.close();
  } finally {
    elements.cancelClearHistoryButton.disabled = false;
    elements.confirmClearHistoryButton.disabled = false;
  }
}

elements.clearHistoryButton.addEventListener("click", openClearHistoryDialog);
elements.confirmClearHistoryButton.addEventListener("click", clearAllHistory);
elements.siteSearchInput.addEventListener("input", renderSites);

webExtensionApi.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  const nextLocale = changes[LANGUAGE_STORAGE_KEY]?.newValue;

  if (SUPPORTED_LOCALES.has(nextLocale)) {
    setActiveLocale(nextLocale)
      .then(scheduleRenderSites)
      .catch((error) => setStatus(error.message || t("errorInternal"), "error"));
  }

  if (changes[CONSENT_STORAGE_KEY]) {
    collectionEnabled = changes[CONSENT_STORAGE_KEY].newValue === true;
    updateLiveIndicator();
  }

  let recordsChanged = false;

  for (const [key, change] of Object.entries(changes)) {
    if (isSiteRecord(change.newValue)) {
      siteData[key] = change.newValue;
      recordsChanged = true;
    } else if (isSiteRecord(change.oldValue)) {
      delete siteData[key];
      recordsChanged = true;
    }
  }

  if (recordsChanged) {
    scheduleRenderSites();
  }
});

webExtensionApi.runtime.onMessage.addListener((message) => {
  if (message?.type !== MESSAGE_SITE_DATA_UPDATED) {
    return false;
  }

  applyLiveSiteUpdate(message);
  return false;
});

async function init() {
  await setActiveLocale(await getPreferredLocale());
  await loadCollectionState();
  await loadSites();
}

init().catch((error) => {
  setStatus(error.message || t("errorInternal"), "error");
});
