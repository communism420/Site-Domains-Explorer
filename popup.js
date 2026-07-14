"use strict";

const MESSAGE_REFRESH_CURRENT_TAB = "SDE_REFRESH_CURRENT_TAB";
const MESSAGE_GET_CURRENT_SITE_DATA = "SDE_GET_CURRENT_SITE_DATA";
const MESSAGE_CLEAR_ALL_DATA = "SDE_CLEAR_ALL_DATA";
const MESSAGE_GET_COLLECTION_STATE = "SDE_GET_COLLECTION_STATE";
const MESSAGE_SITE_DATA_UPDATED = "SDE_SITE_DATA_UPDATED";

const LANGUAGE_STORAGE_KEY = "__sde_language";
const CONSENT_STORAGE_KEY = "__sde_consent";
const DEFAULT_LOCALE = "en";
const SUPPORTED_LOCALES = new Set(["en", "es", "de", "pt_BR", "ru", "uk", "fr"]);
const FALLBACK_MESSAGES = {
  clearAllDataFailed: "Could not clear data.",
  copyFailed: "Could not copy domains.",
  errorInternal: "Internal error.",
  extensionName: "Site Domains Explorer",
  loadCurrentSiteFailed: "Could not load current site data.",
  openHistoryFailed: "Could not open the all-sites page.",
  openPrivacySettingsFailed: "Could not open privacy settings.",
  refreshCurrentSiteFailed: "Could not refresh current site."
};

const COPY_SCOPES = {
  all: {
    buttonKey: "copyAllButton",
    labelKey: "copyScopeAll"
  },
  firstParty: {
    buttonKey: "copyOwnButton",
    labelKey: "copyScopeFirstParty"
  },
  thirdParty: {
    buttonKey: "copyThirdPartyButton",
    labelKey: "copyScopeThirdParty"
  }
};

const elements = {
  clearButton: document.getElementById("clearButton"),
  copyAllButton: document.getElementById("copyAllButton"),
  copyOwnButton: document.getElementById("copyOwnButton"),
  copyThirdPartyButton: document.getElementById("copyThirdPartyButton"),
  detailCount: document.getElementById("detailCount"),
  detailHostname: document.getElementById("detailHostname"),
  domainSearchInput: document.getElementById("domainSearchInput"),
  domainsList: document.getElementById("domainsList"),
  emptyState: document.getElementById("emptyState"),
  historyButton: document.getElementById("historyButton"),
  languageSelect: document.getElementById("languageSelect"),
  liveState: document.getElementById("liveState"),
  liveStateText: document.getElementById("liveStateText"),
  privacyButton: document.getElementById("privacyButton"),
  refreshButton: document.getElementById("refreshButton"),
  statusText: document.getElementById("statusText"),
  visitMeta: document.getElementById("visitMeta")
};

let activeLocale = DEFAULT_LOCALE;
let activeMessages = {};
let collectionEnabled = false;
let currentSiteKey = "";
let currentRecord = {
  domains: [],
  lastVisited: 0,
  visitCount: 0
};

function t(messageName, substitutions) {
  const template =
    activeMessages[messageName]?.message ||
    chrome.i18n.getMessage(messageName) ||
    FALLBACK_MESSAGES[messageName] ||
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
  const normalized = chrome.i18n.getUILanguage().replace("-", "_");
  const baseLocale = normalized.split("_")[0];

  if (SUPPORTED_LOCALES.has(normalized)) {
    return normalized;
  }

  if (SUPPORTED_LOCALES.has(baseLocale)) {
    return baseLocale;
  }

  return DEFAULT_LOCALE;
}

function getIntlLocale() {
  return activeLocale.replace("_", "-");
}

async function loadMessages(locale) {
  const response = await fetch(chrome.runtime.getURL(`_locales/${locale}/messages.json`));

  if (!response.ok) {
    throw new Error(`Failed to load locale: ${locale}`);
  }

  return response.json();
}

async function getSavedLocale() {
  const items = await chrome.storage.local.get(LANGUAGE_STORAGE_KEY);
  const savedLocale = items[LANGUAGE_STORAGE_KEY];

  return SUPPORTED_LOCALES.has(savedLocale) ? savedLocale : getBrowserLocale();
}

async function setActiveLocale(locale) {
  activeLocale = SUPPORTED_LOCALES.has(locale) ? locale : DEFAULT_LOCALE;
  activeMessages = await loadMessages(activeLocale);
  elements.languageSelect.value = activeLocale;
  localizeDocument();
  updateLiveIndicator();
}

function localizeDocument() {
  document.documentElement.lang = getIntlLocale();
  document.title = t("extensionName");

  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }

  for (const element of document.querySelectorAll("[data-i18n-placeholder]")) {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  }

  for (const element of document.querySelectorAll("[data-i18n-aria-label]")) {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  }
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

function applyLiveSiteUpdate(message) {
  if (!currentSiteKey || message.siteKey !== currentSiteKey) {
    return;
  }

  const domains = new Set(currentRecord.domains || []);

  for (const domain of message.domains || []) {
    if (typeof domain === "string" && domain) {
      domains.add(domain);
    }
  }

  currentRecord = {
    domains: Array.from(domains),
    lastVisited: Math.max(currentRecord.lastVisited || 0, message.lastVisited || 0),
    visitCount:
      Math.max(0, currentRecord.visitCount || 0) + Math.max(0, message.visitCountDelta || 0)
  };
  renderCurrentSite();
}

async function loadCollectionState() {
  const response = await chrome.runtime.sendMessage({ type: MESSAGE_GET_COLLECTION_STATE });

  if (!response?.ok) {
    throw new Error(getResponseError(response, "errorInternal"));
  }

  collectionEnabled = response.enabled === true;
  updateLiveIndicator();
}

function isFirstPartyDomain(domain) {
  if (!currentSiteKey) {
    return false;
  }

  return domain === currentSiteKey || domain.endsWith(`.${currentSiteKey}`);
}

function getVisibleDomains() {
  const query = elements.domainSearchInput.value.trim().toLowerCase();

  return getSortedDomains().filter((domain) => domain.includes(query));
}

function getSortedDomains() {
  return [...(currentRecord.domains || [])].sort((a, b) => {
    const aIsFirstParty = isFirstPartyDomain(a);
    const bIsFirstParty = isFirstPartyDomain(b);

    if (aIsFirstParty !== bIsFirstParty) {
      return aIsFirstParty ? -1 : 1;
    }

    return a.localeCompare(b);
  });
}

function getDomainsByScope(scope) {
  const domains = getSortedDomains();

  if (scope === "firstParty") {
    return domains.filter(isFirstPartyDomain);
  }

  if (scope === "thirdParty") {
    return domains.filter((domain) => !isFirstPartyDomain(domain));
  }

  return domains;
}

function updateCopyButtons() {
  const firstPartyCount = getDomainsByScope("firstParty").length;
  const thirdPartyCount = getDomainsByScope("thirdParty").length;
  const allCount = currentRecord.domains?.length || 0;

  elements.copyOwnButton.disabled = firstPartyCount === 0;
  elements.copyThirdPartyButton.disabled = thirdPartyCount === 0;
  elements.copyAllButton.disabled = allCount === 0;

  elements.copyOwnButton.textContent = t("copyOwnButton", String(firstPartyCount));
  elements.copyThirdPartyButton.textContent = t("copyThirdPartyButton", String(thirdPartyCount));
  elements.copyAllButton.textContent = t("copyAllButton", String(allCount));
}

function renderDomains() {
  const domains = getVisibleDomains();

  elements.domainsList.replaceChildren();
  elements.emptyState.classList.toggle("hidden", domains.length > 0);

  for (const domain of domains) {
    const row = document.createElement("div");
    row.className = "domain-row";

    const name = document.createElement("span");
    name.textContent = domain;

    const label = document.createElement("span");
    label.className = isFirstPartyDomain(domain)
      ? "domain-label first-party"
      : "domain-label third-party";
    label.textContent = isFirstPartyDomain(domain)
      ? t("domainLabelOwn")
      : t("domainLabelThirdParty");

    row.append(name, label);
    elements.domainsList.append(row);
  }
}

function renderCurrentSite() {
  const domainsCount = currentRecord.domains?.length || 0;

  elements.detailHostname.textContent = currentSiteKey || t("inaccessiblePage");
  elements.detailCount.textContent = String(domainsCount);
  updateCopyButtons();
  elements.visitMeta.textContent = currentSiteKey
    ? t("domainsSummary", [String(domainsCount), formatVisitTime(currentRecord.lastVisited)])
    : t("openWebPageHint");

  renderDomains();
}

function applyCurrentSiteResponse(response) {
  currentSiteKey = response.siteKey || "";
  currentRecord = response.record || {
    domains: [],
    lastVisited: 0,
    visitCount: 0
  };

  renderCurrentSite();
}

async function writeTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_error) {
      // Fall back to a user-initiated document copy in older Chromium versions.
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

async function copyDomains(scope) {
  const domains = getDomainsByScope(scope);
  const scopeLabel = t(COPY_SCOPES[scope].labelKey);
  const copyButton = {
    all: elements.copyAllButton,
    firstParty: elements.copyOwnButton,
    thirdParty: elements.copyThirdPartyButton
  }[scope];

  if (domains.length === 0) {
    setStatus(t("noDomainsForScope", scopeLabel), "warning");
    return;
  }

  copyButton.disabled = true;

  try {
    await writeTextToClipboard(domains.join("\n"));
    setStatus(t("copiedStatus", [scopeLabel, String(domains.length)]), "success");
  } catch (error) {
    setStatus(error.message || t("copyFailed"), "error");
  } finally {
    updateCopyButtons();
  }
}

async function loadCurrentSite() {
  setStatus(t("statusLoadingCurrentTab"));

  try {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE_GET_CURRENT_SITE_DATA });

    if (!response?.ok) {
      throw new Error(getResponseError(response, "loadCurrentSiteFailed"));
    }

    applyCurrentSiteResponse(response);
    collectionEnabled = true;
    updateLiveIndicator();
    setStatus("");
  } catch (error) {
    currentSiteKey = "";
    currentRecord = { domains: [], lastVisited: 0, visitCount: 0 };
    renderCurrentSite();
    setStatus(error.message, "error");
  }
}

async function refreshCurrentSite() {
  elements.refreshButton.disabled = true;
  setStatus(t("statusRefreshingCurrentTab"));

  try {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE_REFRESH_CURRENT_TAB });

    if (!response?.ok) {
      throw new Error(getResponseError(response, "refreshCurrentSiteFailed"));
    }

    applyCurrentSiteResponse(response);

    if (!response.contentScriptResponded) {
      setStatus(t("baseDataSavedReload"), "warning");
    } else {
      setStatus(t("currentSiteUpdated"), "success");
    }
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    elements.refreshButton.disabled = false;
  }
}

async function clearAllData() {
  const confirmed = confirm(t("clearConfirm"));

  if (!confirmed) {
    return;
  }

  elements.clearButton.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE_CLEAR_ALL_DATA });

    if (!response?.ok) {
      throw new Error(getResponseError(response, "clearAllDataFailed"));
    }

    currentRecord = { domains: [], lastVisited: 0, visitCount: 0 };
    renderCurrentSite();
    setStatus(t("recordsRemoved", String(response.removed || 0)), "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    elements.clearButton.disabled = false;
  }
}

async function openHistoryPage() {
  elements.historyButton.disabled = true;

  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL("history.html") });
    window.close();
  } catch (error) {
    setStatus(error.message || t("openHistoryFailed"), "error");
    elements.historyButton.disabled = false;
  }
}

async function openPrivacySettings() {
  elements.privacyButton.disabled = true;

  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
    window.close();
  } catch (error) {
    setStatus(error.message || t("openPrivacySettingsFailed"), "error");
    elements.privacyButton.disabled = false;
  }
}

async function handleLanguageChange() {
  const nextLocale = elements.languageSelect.value;
  await chrome.storage.local.set({ [LANGUAGE_STORAGE_KEY]: nextLocale });
  await setActiveLocale(nextLocale);
  renderCurrentSite();
  setStatus("");
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== MESSAGE_SITE_DATA_UPDATED) {
    return false;
  }

  applyLiveSiteUpdate(message);
  return false;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes[CONSENT_STORAGE_KEY]) {
    collectionEnabled = changes[CONSENT_STORAGE_KEY].newValue === true;
    updateLiveIndicator();
  }

  if (!currentSiteKey || !changes[currentSiteKey]) {
    return;
  }

  const nextRecord = changes[currentSiteKey].newValue;

  currentRecord = isSiteRecord(nextRecord)
    ? nextRecord
    : { domains: [], lastVisited: 0, visitCount: 0 };
  renderCurrentSite();
});

elements.clearButton.addEventListener("click", clearAllData);
elements.copyAllButton.addEventListener("click", () => copyDomains("all"));
elements.copyOwnButton.addEventListener("click", () => copyDomains("firstParty"));
elements.copyThirdPartyButton.addEventListener("click", () => copyDomains("thirdParty"));
elements.domainSearchInput.addEventListener("input", renderDomains);
elements.historyButton.addEventListener("click", openHistoryPage);
elements.languageSelect.addEventListener("change", () => {
  handleLanguageChange().catch((error) => {
    setStatus(error.message || t("errorInternal"), "error");
  });
});
elements.privacyButton.addEventListener("click", openPrivacySettings);
elements.refreshButton.addEventListener("click", refreshCurrentSite);

async function init() {
  await setActiveLocale(await getSavedLocale());
  await loadCollectionState();
  await loadCurrentSite();
}

init().catch((error) => {
  localizeDocument();
  setStatus(error.message || t("errorInternal"), "error");
});
