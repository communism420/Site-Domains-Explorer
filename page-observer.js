"use strict";

(() => {
  const MESSAGE_CHANNEL = "__site_domains_explorer_network_v1__";
  const SUPPORTED_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);
  const postMessageToWindow = window.postMessage.bind(window);

  let collectionEnabled = false;

  window.addEventListener("message", (event) => {
    if (
      event.source === window &&
      event.data?.channel === MESSAGE_CHANNEL &&
      event.data?.type === "collection-state"
    ) {
      collectionEnabled = event.data.enabled === true;
    }
  });

  function reportUrlCandidate(value) {
    if (!collectionEnabled || value === undefined || value === null) {
      return;
    }

    try {
      const rawUrl =
        typeof value === "string" || value instanceof URL
          ? String(value)
          : typeof value.url === "string"
            ? value.url
            : "";
      const parsed = new URL(rawUrl, document.baseURI || location.href);

      if (!SUPPORTED_PROTOCOLS.has(parsed.protocol) || !parsed.hostname) {
        return;
      }

      postMessageToWindow(
        {
          channel: MESSAGE_CHANNEL,
          type: "hostname",
          hostname: parsed.hostname.toLowerCase().replace(/\.$/, "")
        },
        "*"
      );
    } catch (_error) {
      // Network APIs must keep their native behavior for malformed inputs.
    }
  }

  function observeSafely(observer, args) {
    try {
      observer(args);
    } catch (_error) {
      // Observation must never change the outcome of the wrapped browser API.
    }
  }

  function wrapCallable(owner, propertyName, observer) {
    const original = owner?.[propertyName];

    if (typeof original !== "function") {
      return;
    }

    try {
      owner[propertyName] = new Proxy(original, {
        apply(target, thisArgument, args) {
          observeSafely(observer, args);
          return Reflect.apply(target, thisArgument, args);
        }
      });
    } catch (_error) {
      // Some pages lock down browser API properties before extension startup.
    }
  }

  function wrapConstructor(owner, propertyName, observer) {
    const Original = owner?.[propertyName];

    if (typeof Original !== "function") {
      return;
    }

    try {
      owner[propertyName] = new Proxy(Original, {
        apply(target, thisArgument, args) {
          observeSafely(observer, args);
          return Reflect.apply(target, thisArgument, args);
        },
        construct(target, args, newTarget) {
          observeSafely(observer, args);
          return Reflect.construct(target, args, newTarget);
        }
      });
    } catch (_error) {
      // Leave the native constructor untouched when it cannot be replaced.
    }
  }

  const observeFirstArgument = (args) => reportUrlCandidate(args[0]);
  const observeXhrOpen = (args) => reportUrlCandidate(args[1]);

  wrapCallable(window, "fetch", observeFirstArgument);
  wrapCallable(window.XMLHttpRequest?.prototype, "open", observeXhrOpen);
  wrapCallable(window.Navigator?.prototype, "sendBeacon", observeFirstArgument);
  wrapCallable(window.ServiceWorkerContainer?.prototype, "register", observeFirstArgument);

  for (const constructorName of [
    "EventSource",
    "SharedWorker",
    "WebSocket",
    "WebTransport",
    "Worker"
  ]) {
    wrapConstructor(window, constructorName, observeFirstArgument);
  }

  postMessageToWindow(
    {
      channel: MESSAGE_CHANNEL,
      type: "observer-ready"
    },
    "*"
  );
})();
