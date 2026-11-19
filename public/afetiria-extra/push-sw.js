/* Only handles pushes. No fetch interception, offline cache or authentication storage. */
self.addEventListener("install", event => {event.waitUntil(self.skipWaiting());});
self.addEventListener("activate", event => {event.waitUntil(self.clients.claim());});
self.addEventListener("push", event => {
  if (!event.data) return;
  let payload;
  try {payload=event.data.json();} catch {return;}
  const data=payload.data;
  if (!data || data.type !== "afetiria-confirmed" || typeof data.body !== "string" || typeof data.eventId !== "string") return;
  event.waitUntil(self.registration.showNotification(typeof data.title === "string" && data.title.trim() && data.title.length <= 80 ? data.title : "アフェティリアハード追加便", {
    body:data.body, tag:"afetiria-confirmed-"+data.eventId, icon:"/UDM/afetiria-extra/icon-192.png", data:{path:"/UDM/afetiria-extra/"},
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url=new URL("/UDM/afetiria-extra/",self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(async windows => {
    for (const client of windows) {
      if (client.url === url) {await client.focus();return;}
    }
    await self.clients.openWindow(url);
  }));
});
