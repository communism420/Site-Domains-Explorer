"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const backgroundSource = fs.readFileSync(
  path.join(__dirname, "..", "background.js"),
  "utf8"
);

function createEvent() {
  const listeners = [];

  return {
    listeners,
    addListener(listener) {
      listeners.push(listener);
    }
  };
}

function createStorageArea({ supportsAccessLevel }) {
  const values = new Map([["__sde_consent", false]]);
  let accessLevelCalls = 0;

  const area = {
    async get(keys) {
      if (keys === null) {
        return Object.fromEntries(values);
      }

      const requestedKeys = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(
        requestedKeys
          .filter((key) => typeof key === "string" && values.has(key))
          .map((key) => [key, values.get(key)])
      );
    },
    async set(items) {
      Object.entries(items).forEach(([key, value]) => values.set(key, value));
    },
    async remove(keys) {
      const requestedKeys = Array.isArray(keys) ? keys : [keys];
      requestedKeys.forEach((key) => values.delete(key));
    }
  };

  if (supportsAccessLevel) {
    area.setAccessLevel = async () => {
      accessLevelCalls += 1;
    };
  }

  return {
    area,
    getAccessLevelCalls: () => accessLevelCalls
  };
}

function createWebExtensionApi({ supportsAccessLevel }) {
  const runtimeMessageEvent = createEvent();
  const runtimeInstalledEvent = createEvent();
  const storageChangedEvent = createEvent();
  const webRequestEvent = createEvent();
  const navigationCommittedEvent = createEvent();
  const navigationHistoryEvent = createEvent();
  const navigationFragmentEvent = createEvent();
  const tabRemovedEvent = createEvent();
  const storage = createStorageArea({ supportsAccessLevel });

  return {
    api: {
      i18n: {
        getMessage: (name) => name,
        getUILanguage: () => "en-US"
      },
      runtime: {
        getURL: (relativePath) => `moz-extension://test/${relativePath}`,
        onInstalled: runtimeInstalledEvent,
        onMessage: runtimeMessageEvent,
        sendMessage: async () => undefined
      },
      storage: {
        local: storage.area,
        onChanged: storageChangedEvent
      },
      tabs: {
        create: async () => undefined,
        get: async (tabId) => ({ id: tabId, url: "https://example.com/" }),
        onRemoved: tabRemovedEvent,
        query: async () => [],
        sendMessage: async () => undefined
      },
      webNavigation: {
        onCommitted: navigationCommittedEvent,
        onHistoryStateUpdated: navigationHistoryEvent,
        onReferenceFragmentUpdated: navigationFragmentEvent
      },
      webRequest: {
        onBeforeRequest: webRequestEvent
      }
    },
    events: {
      navigationCommittedEvent,
      navigationFragmentEvent,
      navigationHistoryEvent,
      runtimeInstalledEvent,
      runtimeMessageEvent,
      tabRemovedEvent,
      webRequestEvent
    },
    getAccessLevelCalls: storage.getAccessLevelCalls
  };
}

function sendRuntimeMessage(listener, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Message response timed out")), 1000);
    const keepChannelOpen = listener(message, {}, (response) => {
      clearTimeout(timeout);
      resolve({ keepChannelOpen, response: JSON.parse(JSON.stringify(response)) });
    });
  });
}

for (const namespace of ["browser", "chrome"]) {
  test(`background starts with the ${namespace} namespace`, async () => {
    const supportsAccessLevel = namespace === "chrome";
    const mock = createWebExtensionApi({ supportsAccessLevel });
    const context = vm.createContext({
      [namespace]: mock.api,
      URL,
      clearTimeout,
      console: { warn() {} },
      setTimeout
    });

    vm.runInContext(backgroundSource, context, { filename: "background.js" });

    assert.equal(mock.events.runtimeMessageEvent.listeners.length, 1);
    assert.equal(mock.events.runtimeInstalledEvent.listeners.length, 1);
    assert.equal(mock.events.webRequestEvent.listeners.length, 1);
    assert.equal(mock.events.navigationCommittedEvent.listeners.length, 1);
    assert.equal(mock.events.navigationHistoryEvent.listeners.length, 1);
    assert.equal(mock.events.navigationFragmentEvent.listeners.length, 1);
    assert.equal(mock.events.tabRemovedEvent.listeners.length, 1);

    const result = await sendRuntimeMessage(
      mock.events.runtimeMessageEvent.listeners[0],
      { type: "SDE_GET_COLLECTION_STATE" }
    );

    assert.equal(result.keepChannelOpen, true);
    assert.deepEqual(result.response, { ok: true, enabled: false });
    assert.equal(mock.getAccessLevelCalls(), supportsAccessLevel ? 1 : 0);
  });
}
