/*
 * A worker that retires its predecessor.
 *
 * The app this repository replaced was a PWA: it registered a service worker at
 * this path, and a phone that still has it serves that old shell from its own
 * cache — opening the site shows the old design even though the pages behind the
 * cache have been replaced. Browsers check this script for updates on navigation,
 * so the moment it is served the old registration downloads it; this one then
 * deletes every cache, unregisters the registration and reloads the pages the old
 * worker was holding, which is the point at which the new site can load.
 *
 * Nothing registers this worker. It exists only to replace one that was.
 */
self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
      await self.registration.unregister()
      const windows = await self.clients.matchAll({ type: "window" })
      await Promise.all(
        windows.map((client) => client.navigate(client.url).catch(() => undefined)),
      )
    })(),
  )
})
