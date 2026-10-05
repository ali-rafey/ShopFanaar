import { useEffect, useState } from "react";
import * as api from "../api";
import { ConfirmButton, ErrorBox, money, PageHead, Spinner, useLoad, useToast } from "../ui";
import NotificationsCard from "../NotificationsCard";
import { useAuth } from "../AdminApp";

export default function Settings() {
  const toast = useToast();
  const { user, signOut } = useAuth();
  const res = useLoad(() => api.getSettings(), []);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (res.data) {
      setForm({
        shippingFee: String(res.data.shippingFee),
        freeShippingThreshold: res.data.freeShippingThreshold == null ? "" : String(res.data.freeShippingThreshold),
        acceptingOrders: res.data.acceptingOrders,
      });
    }
  }, [res.data]);

  if (res.error) return <ErrorBox error={res.error} onRetry={res.reload} />;
  if (!form) return <Spinner />;

  const fee = Number(form.shippingFee);
  const threshold = form.freeShippingThreshold === "" ? null : Number(form.freeShippingThreshold);
  const valid =
    /^\d+$/.test(form.shippingFee) && (form.freeShippingThreshold === "" || /^\d+$/.test(form.freeShippingThreshold));

  async function save(e) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      await api.saveSettings({ shippingFee: fee, freeShippingThreshold: threshold, acceptingOrders: form.acceptingOrders });
      toast("Settings saved");
      res.reload();
    } catch (err) {
      toast(err.message || "Couldn't save.", "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHead title="Settings" sub="Order notifications and checkout rules." />

      <NotificationsCard />

      <form className="adm-card adm-narrow" onSubmit={save}>
        <h2>Checkout</h2>
        <label className="adm-toggle">
          <input
            type="checkbox"
            checked={form.acceptingOrders}
            onChange={(e) => setForm({ ...form, acceptingOrders: e.target.checked })}
          />
          <span>
            <strong>Accepting orders</strong>
            <small>Turn off to pause checkout (e.g. over Eid). Shoppers can still browse.</small>
          </span>
        </label>

        <div className="adm-row">
          <label className="adm-field">
            <span>Shipping fee (Rs.)</span>
            <input inputMode="numeric" value={form.shippingFee} onChange={(e) => setForm({ ...form, shippingFee: e.target.value })} />
          </label>
          <label className="adm-field">
            <span>Free shipping from (Rs.)</span>
            <input
              inputMode="numeric"
              placeholder="Never"
              value={form.freeShippingThreshold}
              onChange={(e) => setForm({ ...form, freeShippingThreshold: e.target.value })}
            />
          </label>
        </div>
        <p className="adm-hint">
          {valid
            ? threshold == null
              ? `Every order pays ${money(fee)} shipping.`
              : `Orders under ${money(threshold)} pay ${money(fee)}; ${money(threshold)} and above ship free.`
            : "Use whole numbers only."}
        </p>
        <p className="adm-hint">Payment method: cash on delivery.</p>

        <button className="adm-btn primary" disabled={saving || !valid}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>

      <section className="adm-card adm-narrow adm-only-mobile">
        <h2>Account</h2>
        <p className="adm-sub" style={{ marginBottom: 14 }}>{user?.email}</p>
        <div className="adm-btns">
          <a className="adm-btn" href="/" target="_blank" rel="noreferrer">
            View store ↗
          </a>
          <button className="adm-btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </section>

      {api.BACKEND === "demo" && (
        <section className="adm-card adm-narrow">
          <h2>Demo data</h2>
          <p className="adm-hint">
            Reset the browser-local demo database back to the original catalog with no orders.
          </p>
          <ConfirmButton
            confirmLabel="Yes, reset everything"
            onConfirm={async () => {
              await api.resetDemo();
              toast("Demo data reset");
              res.reload();
            }}
          >
            Reset demo data
          </ConfirmButton>
        </section>
      )}
    </>
  );
}
