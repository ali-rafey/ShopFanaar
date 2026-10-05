import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import { currentSubscription, deviceName, disablePush, enablePush, pushEnvironment } from "./push";
import { isMuted, playOrderSound, setMuted } from "./sound";
import { ConfirmButton, fmtDate, useToast } from "./ui";

// What a test result from the push function means, in plain words.
function explain(result) {
  if (!result || result.status == null) {
    return { ok: false, text: "No answer from the server yet — try again in a minute." };
  }
  let body = {};
  try {
    body = JSON.parse(result.body);
  } catch {
    /* not JSON */
  }
  if (result.status === 200 && body.sent > 0) return { ok: true, text: "Sent — check your phone." };
  if (result.status === 200) return { ok: false, text: "The server couldn't reach this device. Turn notifications off and on again." };
  if (result.status === 401) return { ok: false, text: "Server secret mismatch — check NOTIFY_SECRET in Vercel." };
  if (result.status === 404) return { ok: false, text: "The notification service isn't deployed yet." };
  if (/VAPID/.test(result.body)) return { ok: false, text: "VAPID_PRIVATE_KEY is missing in Vercel." };
  return { ok: false, text: `Server error (${result.status}).` };
}

export default function NotificationsCard() {
  const toast = useToast();
  const env = pushEnvironment();
  const [sub, setSub] = useState(undefined); // undefined = checking
  const [devices, setDevices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [muted, setMutedState] = useState(isMuted());
  const live = api.BACKEND === "supabase";

  const refresh = useCallback(async () => {
    setSub(env.supported ? await currentSubscription() : null);
    if (live) setDevices(await api.listPushDevices().catch(() => []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function turnOn() {
    setBusy(true);
    setResult(null);
    try {
      const s = await enablePush(); // straight from the tap — iPhone requires it
      await api.savePushDevice(s, deviceName());
      toast("Notifications are on for this device");
      await refresh();
    } catch (e) {
      toast(e.message || "Couldn't turn on notifications.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const endpoint = await disablePush();
      await api.removePushDevice(endpoint);
      toast("Notifications are off for this device");
      setResult(null);
      await refresh();
    } catch (e) {
      toast(e.message || "Couldn't turn off notifications.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setResult({ pending: true });
    try {
      setResult(explain(await api.sendTestPush()));
    } catch (e) {
      setResult({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const here = sub && devices.find((d) => d.endpoint === sub.endpoint);

  return (
    <section className="adm-card adm-narrow" id="notifications">
      <h2>Order notifications</h2>
      <p className="adm-sub">A notification on your phone the moment an order is placed. Tap it to open the order.</p>

      <div className="adm-notif-stage" aria-hidden="true">
        <div className="adm-notif-preview">
          <img src="/icons/app-192.png" alt="" />
          <div>
            <div className="adm-notif-top">
              <strong>New order #1001</strong>
              <span>now</span>
            </div>
            <strong className="adm-notif-from">from Fanaar</strong>
            <p>1 item totaling Rs.2,400 from Online Store.</p>
          </div>
        </div>
      </div>
      <p className="adm-hint">
        iPhone always adds the “from Fanaar” line to web-app notifications, so the order is the title.
      </p>

      {!live ? (
        <p className="adm-hint">Available once the store is connected to Supabase (not in demo mode).</p>
      ) : env.needsInstall ? (
        <div className="adm-steps-list">
          <p>
            <strong>On iPhone, add Fanaar to your Home Screen first</strong> — Apple only allows
            notifications for installed web apps.
          </p>
          <ol>
            <li>
              In Safari, tap the <strong>Share</strong> button (square with an arrow).
            </li>
            <li>
              Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
            </li>
            <li>
              Open <strong>Fanaar</strong> from your Home Screen, sign in, and come back to
              Settings to turn notifications on.
            </li>
          </ol>
        </div>
      ) : !env.supported ? (
        <p className="adm-hint">
          This browser can&apos;t receive notifications. On iPhone use Safari and add Fanaar to your
          Home Screen; on Android use Chrome.
        </p>
      ) : env.permission === "denied" && !sub ? (
        <p className="adm-error">
          Notifications are blocked for Fanaar on this device. Allow them in your phone&apos;s
          Settings → Notifications (or the browser&apos;s site settings), then reload this page.
        </p>
      ) : sub === undefined ? null : sub && here ? (
        <>
          <p className="adm-on">✓ On for this device ({here.device || deviceName()})</p>
          <div className="adm-btns">
            <button className="adm-btn primary" onClick={test} disabled={busy}>
              {result?.pending ? "Sending…" : "Send test notification"}
            </button>
            <button className="adm-btn" onClick={turnOff} disabled={busy}>
              Turn off on this device
            </button>
          </div>
          {result && !result.pending && (
            <p className={result.ok ? "adm-on" : "adm-field-error"} role="status">
              {result.text}
            </p>
          )}
        </>
      ) : (
        <button className="adm-btn primary" onClick={turnOn} disabled={busy}>
          {busy ? "Turning on…" : "Turn on notifications on this device"}
        </button>
      )}

      {live && devices.length > 0 && (
        <div className="adm-devices">
          <span className="adm-hint">Notifications go to:</span>
          <ul>
            {devices.map((d) => (
              <li key={d.id}>
                <span>
                  {d.device || "Device"}
                  {sub?.endpoint === d.endpoint && " (this one)"}
                  <small className="muted"> · added {fmtDate(d.created_at, false)}</small>
                </span>
                {sub?.endpoint !== d.endpoint && (
                  <ConfirmButton
                    className="adm-link danger"
                    confirmLabel="Remove?"
                    onConfirm={async () => {
                      await api.removePushDevice(d.endpoint);
                      refresh();
                    }}
                  >
                    Remove
                  </ConfirmButton>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="adm-check adm-sound">
        <input
          type="checkbox"
          checked={!muted}
          onChange={(e) => {
            setMuted(!e.target.checked);
            setMutedState(!e.target.checked);
            if (e.target.checked) playOrderSound();
          }}
        />
        Play a sound in this window when an order arrives
      </label>
      {env.ios ? (
        <p className="adm-hint">
          On iPhone, notifications play your Default Alert sound — set it to the Fanaar tone in
          Settings → Sounds &amp; Haptics → Default Alerts.
        </p>
      ) : /Android/.test(navigator.userAgent) ? (
        <p className="adm-hint">
          Android lets you pick the notification sound: Settings → Apps → Fanaar → Notifications.
        </p>
      ) : null}
    </section>
  );
}
