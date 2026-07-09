/* Climature Bedrijfsportaal service worker — offline app-shell cache. */
"use strict";

var CACHE_VERSION = "climature-shell-v4";

var APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "assets/icons/icon.svg",
  "assets/css/app.css",
  "assets/adviestools.html",
  "assets/vendor/jspdf.umd.min.js",
  "assets/js/storage.js",
  "assets/js/pdf.js",
  "assets/js/customers.js",
  "assets/js/quotes.js",
  "assets/js/invoices.js",
  "assets/js/installations.js",
  "assets/js/advice.js",
  "assets/js/reports.js",
  "assets/js/app.js"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      // addAll faalt hard als één bestand ontbreekt; per bestand cachen is robuuster.
      return Promise.all(APP_SHELL.map(function (url) {
        return cache.add(url).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return key === CACHE_VERSION ? null : caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/api/") === 0) return;

  // Navigatieverzoeken: netwerk eerst, val terug op gecachete index.html (offline).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.match("index.html").then(function (cached) {
          return cached || caches.match("./");
        });
      })
    );
    return;
  }

  // App-shell assets: cache eerst, anders netwerk (en cache de nieuwe respons).
  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && response.ok) {
          var clone = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, clone); });
        }
        return response;
      });
    })
  );
});
