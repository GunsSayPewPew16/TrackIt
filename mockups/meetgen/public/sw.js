// The TrackIt app that used to be published at this URL registered a service
// worker at this same path. Returning visitors' browsers would keep serving that
// cached app. This worker replaces it: it clears the old caches, removes itself,
// and reloads any open pages so they show the current site.
self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
      await self.registration.unregister()
      const clients = await self.clients.matchAll({ type: "window" })
      for (const client of clients) {
        client.navigate(client.url)
      }
    })(),
  )
})
