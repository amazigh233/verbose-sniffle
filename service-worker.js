/* Climature Bedrijfsportaal service worker — network-first met offline app-shell. */
"use strict";

var CACHE_PREFIX = "climature-shell-";
var CACHE_NAME = CACHE_PREFIX + "v31";
var APP_SHELL = [
  "./", "index.html", "manifest.webmanifest",
  "assets/icons/icon.svg", "assets/icons/icon-180.png", "assets/icons/icon-192.png",
  "assets/icons/icon-512.png", "assets/icons/icon-maskable-512.png",
  "assets/css/app.css", "assets/adviestools.html",
  "assets/vendor/jspdf.umd.min.js", "assets/vendor/html2canvas.min.js",
  "assets/js/storage.js", "assets/js/quote-document.js", "assets/js/pdf.js",
  "assets/js/customers.js", "assets/js/quotes.js", "assets/js/sales-funnel.js",
  "assets/js/sales-agenda.js", "assets/js/invoices.js", "assets/js/payments.js", "assets/js/installations.js",
  "assets/js/projects.js", "assets/js/inventory.js", "assets/js/service.js", "assets/js/advice-v2-engine.js", "assets/js/product-catalog.js", "assets/js/wasco.js",
  "assets/js/advice-v2.js", "assets/js/advice.js", "assets/js/reports.js", "assets/js/app.js"
];

function cacheKey(request) {
  var url = new URL(typeof request === "string" ? request : request.url, self.location.origin);
  url.search = "";
  return url.href;
}

function cacheResponse(request, response) {
  if (!response || !response.ok) return response;
  var copy = response.clone();
  caches.open(CACHE_NAME).then(function (cache) { return cache.put(cacheKey(request), copy); });
  return response;
}

function networkFirst(request, fallback) {
  return fetch(request).then(function (response) { return cacheResponse(request, response); }).catch(function () {
    return caches.match(cacheKey(request)).then(function (cached) {
      if (cached) return cached;
      if (fallback) return caches.match(cacheKey(fallback));
      return undefined;
    });
  });
}

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
    return Promise.all(APP_SHELL.map(function (url) {
      return fetch(url, { cache: "reload" }).then(function (response) {
        if (!response.ok) throw new Error("App-shellbestand ontbreekt: " + url);
        return cache.put(cacheKey(url), response);
      }).catch(function () { return null; });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME; }).map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf("/api/") === 0 || url.pathname.indexOf("/medewerkers") === 0) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "index.html"));
    return;
  }
  if (/\.(?:js|css|html)$/.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(caches.match(cacheKey(request)).then(function (cached) {
    return cached || fetch(request).then(function (response) { return cacheResponse(request, response); });
  }));
});
