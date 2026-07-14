"use strict";

const MESSAGE_GET_COLLECTION_STATE = "SDE_GET_COLLECTION_STATE";
const MESSAGE_SET_COLLECTION_STATE = "SDE_SET_COLLECTION_STATE";
const LANGUAGE_STORAGE_KEY = "__sde_language";
const DEFAULT_LOCALE = "en";
const SUPPORTED_LOCALES = new Set(["en", "es", "de", "pt_BR", "ru", "uk", "fr"]);
const FALLBACK_MESSAGES = {
  collectionDisabledStatus: "Future domain collection is disabled.",
  collectionEnabledStatus: "Domain collection is enabled.",
  disableCollectionConfirm: "Disable future domain collection? Saved history will not be deleted.",
  errorInternal: "Internal error.",
  extensionName: "Site Domains Explorer",
  settingsLoadFailed: "Could not load privacy settings.",
  settingsSaveFailed: "Could not save privacy settings."
};

const elements = {
  closeButton: document.getElementById("closeButton"),
  consentCheckbox: document.getElementById("consentCheckbox"),
  disableButton: document.getElementById("disableButton"),
  disabledState: document.getElementById("disabledState"),
  enableButton: document.getElementById("enableButton"),
  enabledState: document.getElementById("enabledState"),
  languageSelect: document.getElementById("languageSelect"),
  notNowButton: document.getElementById("notNowButton"),
  statusText: document.getElementById("statusText")
};

let activeLocale = DEFAULT_LOCALE;
let activeMessages = {};
let collectionEnabled = false;

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

  return SUPPORTED_LOCALES.has(baseLocale) ? baseLocale : DEFAULT_LOCALE;
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

function localizeDocument() {
  document.documentElement.lang = getIntlLocale();
  document.title = `${t("privacySettingsTitle")} - ${t("extensionName")}`;

  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
}

async function setActiveLocale(locale) {
  activeLocale = SUPPORTED_LOCALES.has(locale) ? locale : DEFAULT_LOCALE;
  activeMessages = await loadMessages(activeLocale);
  elements.languageSelect.value = activeLocale;
  localizeDocument();
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

function renderCollectionState() {
  elements.disabledState.classList.toggle("hidden", collectionEnabled);
  elements.enabledState.classList.toggle("hidden", !collectionEnabled);

  if (!collectionEnabled) {
    elements.consentCheckbox.checked = false;
    elements.enableButton.disabled = true;
  }
}

function setControlsBusy(busy) {
  elements.disableButton.disabled = busy;
  elements.notNowButton.disabled = busy;
  elements.consentCheckbox.disabled = busy;
  elements.enableButton.disabled = busy || !elements.consentCheckbox.checked;
}

async function loadCollectionState() {
  const response = await chrome.runtime.sendMessage({ type: MESSAGE_GET_COLLECTION_STATE });

  if (!response?.ok) {
    throw new Error(getResponseError(response, "settingsLoadFailed"));
  }

  collectionEnabled = response.enabled === true;
  renderCollectionState();
}

async function saveCollectionState(enabled) {
  setControlsBusy(true);

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_SET_COLLECTION_STATE,
      enabled
    });

    if (!response?.ok) {
      throw new Error(getResponseError(response, "settingsSaveFailed"));
    }

    collectionEnabled = response.enabled === true;
    renderCollectionState();
    setStatus(
      collectionEnabled ? t("collectionEnabledStatus") : t("collectionDisabledStatus"),
      "success"
    );
  } catch (error) {
    setStatus(error.message || t("settingsSaveFailed"), "error");
  } finally {
    setControlsBusy(false);
  }
}

async function handleLanguageChange() {
  const nextLocale = elements.languageSelect.value;
  await chrome.storage.local.set({ [LANGUAGE_STORAGE_KEY]: nextLocale });
  await setActiveLocale(nextLocale);
  renderCollectionState();
  setStatus("");
}

function closePage() {
  window.close();
}

elements.consentCheckbox.addEventListener("change", () => {
  elements.enableButton.disabled = !elements.consentCheckbox.checked;
});
elements.enableButton.addEventListener("click", () => {
  if (elements.consentCheckbox.checked) {
    void saveCollectionState(true);
  }
});
elements.disableButton.addEventListener("click", () => {
  if (confirm(t("disableCollectionConfirm"))) {
    void saveCollectionState(false);
  }
});
elements.notNowButton.addEventListener("click", closePage);
elements.closeButton.addEventListener("click", closePage);
elements.languageSelect.addEventListener("change", () => {
  handleLanguageChange().catch((error) => {
    setStatus(error.message || t("errorInternal"), "error");
  });
});

async function init() {
  await setActiveLocale(await getSavedLocale());
  await loadCollectionState();
}

init().catch((error) => {
  localizeDocument();
  renderCollectionState();
  setStatus(error.message || t("settingsLoadFailed"), "error");
});
