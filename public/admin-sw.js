// Service worker for the installed Fanaar admin app: shows a notification
// for every new order (sent by api/notify-order.js) and opens that order
// when the notification is tapped.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data && event.data.text() };
  }

  const shown = self.registration.showNotification(data.title || "Fanaar", {
    body: data.body || "You have a new order.",
    icon: "/icons/app-192.png",
    badge: "/icons/badge-96.png",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    timestamp: Date.now(),
    data: { url: data.url || "/admin/orders" },
  });

  // Home-screen icon badge = orders waiting to be confirmed.
  const badge =
    typeof data.pending === "number" && self.navigator.setAppBadge
      ? self.navigator.setAppBadge(data.pending).catch(() => {})
      : Promise.resolve();

  // Let an open admin window refresh and play its sound.
  const tell = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((list) => list.forEach((c) => c.postMessage({ type: "push", data })));

  event.waitUntil(Promise.all([shown, badge, tell]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/admin", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const admin = windows.find((c) => new URL(c.url).pathname.startsWith("/admin"));
      if (admin) {
        await admin.focus();
        admin.postMessage({ type: "open", url });
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
