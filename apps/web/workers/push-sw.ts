const worker = self as unknown as ServiceWorkerGlobalScope;
/* Only handles pushes. No fetch interception, offline cache or authentication storage. */
worker.addEventListener("install", event => {event.waitUntil(worker.skipWaiting());});
worker.addEventListener("activate", event => {event.waitUntil(worker.clients.claim());});
worker.addEventListener("push", event => {
  if (!event.data) return;
  let payload;
  try {payload=event.data.json();} catch {return;}
  const data=payload.data;
  if (!data || data.type !== "afetiria-confirmed" || typeof data.body !== "string" || typeof data.eventId !== "string") return;
  event.waitUntil(worker.registration.showNotification(typeof data.title === "string" && data.title.trim() && data.title.length <= 80 ? data.title : "アフェティリアハード追加便", {
    body:data.body, tag:"afetiria-confirmed-"+data.eventId, icon:"/UDM/afetiria-extra/icon-192.png", data:{path:"/UDM/afetiria-extra/"},
  }));
});
worker.addEventListener("notificationclick", event => {
  event.notification.close();
  const url=new URL("/UDM/afetiria-extra/",worker.location.origin).href;
  event.waitUntil(worker.clients.matchAll({type:"window",includeUncontrolled:true}).then(async windows => {
    for (const client of windows) {
      if (client.url === url) {await client.focus();return;}
    }
    await worker.clients.openWindow(url);
  }));
});
