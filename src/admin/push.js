// Browser side of order notifications: install detection, permission,
// and the Web Push subscription for this device.
import { VAPID_PUBLIC_KEY } from "../lib/vapid";

const SW_URL = "/admin-sw.js";
const SCOPE = "/admin";

export function pushEnvironment() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return {
    ios,
    standalone,
    supported,
    // iPhone only allows notifications for web apps added to the Home Screen.
    needsInstall: ios && !standalone,
    permission: "Notification" in window ? Notification.permission : "unsupported",
  };
}

export function registerWorker() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register(SW_URL, { scope: SCOPE }).catch(() => null);
}

export async function currentSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration(SCOPE);
  return reg ? reg.pushManager.getSubscription() : null;
}

// Must be called straight from a tap/click (iPhone requires it).
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for Fanaar. Allow them in your phone's Settings → Notifications, then try again."
        : "Notifications weren't allowed."
    );
  }
  const reg = (await registerWorker()) || (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  return (
    existing ||
    reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY),
    })
  );
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) await sub.unsubscribe();
  return sub?.endpoint || null;
}

export function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "This device";
}

export function setBadge(count) {
  try {
    if (count > 0) navigator.setAppBadge?.(count)?.catch?.(() => {});
    else navigator.clearAppBadge?.()?.catch?.(() => {});
  } catch {
    /* not supported */
  }
}

function base64UrlToBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
