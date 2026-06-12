// sw.js

// Import Workbox from the CDN
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// Turn off debug logging for production
workbox.setConfig({ debug: false });

// Versioning your cache
const CACHE_VERSION = 'v1';
const RUNTIME_CACHE = `runtime-cache-${CACHE_VERSION}`;

// Cache Unity build files with StaleWhileRevalidate strategy
workbox.routing.registerRoute(
  ({ url }) => url.href.includes('Build'),
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: RUNTIME_CACHE,
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 50, // Adjust as needed
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// Cache other assets (images, CSS, JS) with StaleWhileRevalidate
workbox.routing.registerRoute(
  ({ request }) =>
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image',
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: 'assets-cache',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 100, // Adjust as needed
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// Use NetworkFirst for HTML files to ensure you get the latest version
workbox.routing.registerRoute(
  ({ request }) => request.mode === 'navigate',
  new workbox.strategies.NetworkFirst({
    cacheName: 'pages-cache',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 20, // Adjust as needed
        purgeOnQuotaError: true,
      }),
    ],
  })
);

