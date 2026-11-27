import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../api";
import { ConfirmButton, ErrorBox, fmtDate, money, PageHead, Spinner, timeAgo, useLoad, useToast } from "../ui";

// Overview → Earnings: the money received — PostEx payments (CPRs, cash
// payment receipts) and orders handed over in person since 1 Jan 2026, plus
// amounts the admin adds for any date (e.g. before 2026), which count in All
// time and, when recent, in the last 30 days. A CPR is "generated" when PostEx puts parcels into a
// payment and "closed" once it has paid it; PostEx's figure for it is close to
// what reaches the bank but not exact, so the admin can enter the amount
// received. The saved record shows straight away; the page then asks PostEx
// what's new (api.postexPayments) and refreshes.

const STORE_START = "2026-10-05"; // parcels booked before this came from the Shopify store
const CHECKED_KEY = "fanaar-payments-checked"; // shared with the Overview's background check
const rs = (n) => money(Math.round(Number(n) || 0));
const signed = (n) => (n < 0 ? `−${rs(-n)}` : rs(n));
const isDelivered = (p) => /^delivered$/i.test(p.status);
const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
const AMOUNT = /^\d{1,8}(\.\d{1,2})?$/;

// "Rs.30,000 PostEx · Rs.3,000 in person · Rs.1,500 added"
function breakdown(b) {
  const parts = [
    b.postex && `${rs(b.postex)} PostEx`,
    b.in_person && `${rs(b.in_person)} in person`,
    b.added && `${rs(b.added)} added`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Nothing yet";
}

export default function Payments() {
  const report = useLoad(() => api.getPaymentsReport(), []);
  const [check, setCheck] = useState({ state: "checking" });
  const [version, setVersion] = useState(0); // bumps whenever earnings change, so the period refreshes
  const { reload: reloadReport } = report;
  const reload = useCallback(() => {
    reloadReport();
    setVersion((v) => v + 1);
  }, [reloadReport]);

  useEffect(() => {
    let alive = true;
    api.postexPayments().then(
      (r) => {
        try {
          localStorage.setItem(CHECKED_KEY, String(Date.now()));
        } catch {
          /* fine */
        }
        if (!alive) return;
        setCheck({ state: "done", at: r.checkedAt, failed: r.failed, markedPaid: r.markedPaid || [] });
        reload();
      },
      (e) => alive && setCheck({ state: "failed", error: e.message })
    );
    return () => {
      alive = false;
    };
  }, [reload]);

  const data = report.data;
  const firstTime = data && data.cprs.length === 0 && data.holding.count === 0 && data.entries.length === 0;
  const e = data?.earnings;

  return (
    <>
      <PageHead
        back={<Link to="/admin" className="adm-back">Overview</Link>}
        title="Earnings"
        sub="Money received: PostEx payments and orders handed over in person since 1 Jan 2026, plus amounts you add for any date."
      />

      <CheckLine check={check} savedAt={data?.checked_at} />
      <ErrorBox error={report.error} onRetry={report.reload} />

      {!data ? (
        !report.error && <Spinner />
      ) : firstTime && check.state === "checking" ? (
        <p className="adm-empty">Getting your payments from PostEx. The first time takes a few seconds…</p>
      ) : (
        <>
          <section className="adm-pay-tiles" aria-label="Earnings at a glance">
            <div className="adm-tile">
              <span className="adm-tile-label">Last 30 days</span>
              <span className="adm-tile-value">{rs(e.d30.total)}</span>
              <span className="adm-tile-note">{breakdown(e.d30)}</span>
            </div>
            <div className="adm-tile">
              <span className="adm-tile-label">All time</span>
              <span className="adm-tile-value">{rs(e.all.total)}</span>
              <span className="adm-tile-note">{breakdown(e.all)}</span>
            </div>
            <div className="adm-tile">
              <span className="adm-tile-label">Generated</span>
              <span className="adm-tile-value">{rs(data.generated.amount)}</span>
              <span className="adm-tile-note">
                {data.generated.count
                  ? `${data.generated.count} ${data.generated.count === 1 ? "CPR" : "CPRs"} to close when PostEx pays`
                  : "Nothing waiting"}
              </span>
            </div>
            <div className="adm-tile">
              <span className="adm-tile-label">With PostEx</span>
              <span className="adm-tile-value">{signed(data.holding.amount)}</span>
              <span className="adm-tile-note">
                {data.holding.count} {data.holding.count === 1 ? "parcel" : "parcels"} not in a payment yet
              </span>
            </div>
          </section>

          <Period version={version} />

          <h2 className="adm-pay-h">PostEx payments (CPRs)</h2>
          {data.cprs.length === 0 ? (
            <p className="adm-empty">No PostEx payment since 1 Jan 2026 yet.</p>
          ) : (
            <ul className="adm-cprs">
              {data.cprs.map((c) => (
                <Cpr key={c.cpr} cpr={c} onChanged={reload} />
              ))}
            </ul>
          )}

          <OtherEarnings entries={data.entries} inPerson={e.all} onChanged={reload} />

          {data.holding.count > 0 && (
            <>
              <h2 className="adm-pay-h">With PostEx, not in a payment yet</h2>
              <ul className="adm-card flush adm-cpr-parcels is-standalone">
                {data.holding.parcels.map((p) => (
                  <Parcel key={p.tracking} parcel={p} />
                ))}
              </ul>
            </>
          )}

          <p className="adm-hint adm-pay-foot">
            A new CPR stays Generated until you close it here, once the PostEx portal shows it Closed. Closing marks
            the orders PostEx delivered in it paid and counts it in earnings that day, at the amount you enter
            (PostEx&apos;s own figure to start with). Orders handed over in person count once they&apos;re marked paid.
          </p>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------- a period
// Earnings between any two dates (api.getEarningsBetween), Pakistan calendar
// days with both ends included: "45 days" is today and the 44 days before.

const PRESETS = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "45", label: "45 days" },
  { key: "90", label: "90 days" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];
const pkToday = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const shiftDay = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayCount = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5) + 1;

function rangeFor(key, custom) {
  const today = pkToday();
  if (/^\d+$/.test(key)) return { from: shiftDay(today, -(Number(key) - 1)), to: today };
  const [y, m] = today.split("-").map(Number);
  if (key === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (key === "lastmonth") {
    return {
      from: new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10),
      to: new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10),
    };
  }
  if (key === "year") return { from: `${y}-01-01`, to: today };
  return custom;
}

// "9 Oct – 22 Nov 2026", "1–30 Nov 2026"
function rangeLabel(from, to) {
  const f = new Date(`${from}T12:00:00Z`);
  const t = new Date(`${to}T12:00:00Z`);
  const day = (d, opts) => d.toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
  if (from === to) return day(t, { day: "numeric", month: "short", year: "numeric" });
  const sameYear = f.getUTCFullYear() === t.getUTCFullYear();
  return `${day(f, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })} – ${day(t, { day: "numeric", month: "short", year: "numeric" })}`;
}

const LINE_KIND = { postex: "PostEx", in_person: "in person", added: "added" };

function Period({ version }) {
  const [key, setKey] = useState("month");
  const [custom, setCustom] = useState(() => ({ from: shiftDay(pkToday(), -44), to: pkToday() }));
  const range = rangeFor(key, custom);
  const valid = Boolean(range.from && range.to) && range.from <= range.to;
  const res = useLoad(
    () => (valid ? api.getEarningsBetween(range.from, range.to) : Promise.resolve(null)),
    [range.from, range.to, valid, version]
  );
  const data = res.data;

  return (
    <section className="adm-card adm-period" aria-label="Earnings for a period">
      <h2 className="adm-pay-h">Pick a period</h2>
      <div className="adm-tabs adm-period-tabs" role="tablist" aria-label="Period">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={key === p.key}
            className={key === p.key ? "on" : ""}
            onClick={() => setKey(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {key === "custom" && (
        <div className="adm-earn-row">
          <label className="adm-field">
            <span>From</span>
            <input
              className="adm-input"
              type="date"
              max={pkToday()}
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
            />
          </label>
          <label className="adm-field">
            <span>To</span>
            <input
              className="adm-input"
              type="date"
              max={pkToday()}
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
            />
          </label>
        </div>
      )}

      {!valid ? (
        <p className="adm-field-error">Choose a start date on or before the end date.</p>
      ) : res.error ? (
        <ErrorBox error={res.error} onRetry={res.reload} />
      ) : !data ? (
        <p className="adm-hint">Adding it up…</p>
      ) : (
        <>
          <div className="adm-period-total">
            <strong>{rs(data.total)}</strong>
            <span>
              {rangeLabel(range.from, range.to)} · {dayCount(range.from, range.to)}{" "}
              {dayCount(range.from, range.to) === 1 ? "day" : "days"}
            </span>
          </div>
          <p className="adm-hint">{breakdown(data)}</p>
          {data.lines.length > 0 && (
            <details className="adm-period-lines">
              <summary>
                What&apos;s in it ({data.lines.length})
              </summary>
              <ul>
                {data.lines.map((l, i) => (
                  <li key={`${l.kind}-${l.ref}-${i}`}>
                    <span>
                      {l.kind === "in_person" ? `Order ${l.ref}` : l.ref}
                      <small>
                        {new Date(l.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                        {LINE_KIND[l.kind]}
                      </small>
                    </span>
                    <b>{rs(l.amount)}</b>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function CheckLine({ check, savedAt }) {
  if (check.state === "checking") {
    return (
      <p className="adm-pay-check">
        <span className="adm-live-dot" aria-hidden="true" /> Checking with PostEx…
      </p>
    );
  }
  if (check.state === "failed") {
    return (
      <p className="adm-pay-check is-off">
        Couldn&apos;t reach PostEx ({check.error}).
        {savedAt ? ` Showing what was saved ${timeAgo(savedAt)}.` : ""}
      </p>
    );
  }
  return (
    <p className="adm-pay-check">
      Up to date with PostEx · checked {timeAgo(check.at)}
      {check.markedPaid?.length > 0 &&
        ` · marked ${check.markedPaid.length === 1 ? "order" : "orders"} ${check.markedPaid.map((n) => `#${n}`).join(", ")} paid`}
      {check.failed > 0 && ` · ${check.failed} ${check.failed === 1 ? "parcel" : "parcels"} couldn't be checked, next time will`}
    </p>
  );
}

// A CPR is "Generated" until the admin closes it here — PostEx's API can't
// tell when PostEx has actually paid (its portal's New / Closed). Closing marks
// the orders PostEx delivered in it paid and counts it in earnings.
function Cpr({ cpr: c, onChanged }) {
  const facts = [
    c.closed ? `Closed ${fmtDate(c.closed_at)}` : `Generated ${fmtDate(c.generated_at)} · not closed yet`,
    `${c.delivered} delivered`,
    c.returns > 0 && `${c.returns} returned`,
  ].filter(Boolean);
  return (
    <li className="adm-cpr">
      <details>
        <summary>
          <span className="adm-cpr-main">
            <span className="adm-cpr-title">{c.cpr}</span>
            <span className="adm-cpr-sub">{facts.join(" · ")}</span>
          </span>
          <span className="adm-cpr-side">
            <span className={`adm-stage ${c.closed ? "adm-stage-order" : "adm-stage-checkout"}`}>
              {c.closed ? "Closed" : "Generated"}
            </span>
            <b>{signed(c.amount)}</b>
            {c.adjusted && <small className="adm-cpr-was">PostEx {signed(c.postex_amount)}</small>}
          </span>
        </summary>
        <dl className="adm-totals adm-cpr-sum">
          <div>
            <dt>Cash collected</dt>
            <dd>{rs(c.cod)}</dd>
          </div>
          <div>
            <dt>PostEx charges</dt>
            <dd>−{rs(c.charges)}</dd>
          </div>
          <div className={c.adjusted ? "" : "grand"}>
            <dt>PostEx&apos;s figure</dt>
            <dd>{signed(c.postex_amount)}</dd>
          </div>
          {c.adjusted && (
            <div className="grand">
              <dt>
                {c.closed ? "You received" : "You expect"}
                {c.note && <small className="adm-cpr-note">{c.note}</small>}
              </dt>
              <dd>{signed(c.amount)}</dd>
            </div>
          )}
        </dl>
        {c.closed ? <CprAmount cpr={c} onChanged={onChanged} /> : <CloseCpr cpr={c} onChanged={onChanged} />}
        <ul className="adm-cpr-parcels">
          {c.parcels.map((p) => (
            <Parcel key={p.tracking} parcel={p} />
          ))}
        </ul>
        <div className="adm-cpr-foot">
          <span>
            Generated {fmtDate(c.generated_at)}
            {c.closed && c.closed_at ? ` · closed ${fmtDate(c.closed_at)}` : ""}
          </span>
          {c.closed && <ReopenCpr cpr={c} onChanged={onChanged} />}
        </div>
      </details>
    </li>
  );
}

// Close a generated CPR once PostEx shows it Closed (paid): the amount
// received — PostEx's figure to start with — then a second tap to confirm.
function CloseCpr({ cpr: c, onChanged }) {
  const toast = useToast();
  const [amount, setAmount] = useState(String(Math.round(c.amount)));
  const [note, setNote] = useState(c.note || "");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const valid = AMOUNT.test(amount);
  const orders = `${c.to_mark} ${c.to_mark === 1 ? "order" : "orders"}`;

  async function close() {
    setBusy(true);
    try {
      const n = Number(amount);
      // Keep PostEx's exact figure unless the amount or note was changed.
      const changed = n !== Math.round(c.amount) || (note.trim() || null) !== (c.note || null);
      const r = await api.closeCpr(c.cpr, changed ? n : null, changed ? note.trim() || null : null);
      toast(r.marked.length ? `${c.cpr} closed · ${r.marked.length} ${r.marked.length === 1 ? "order" : "orders"} marked paid` : `${c.cpr} closed`);
      onChanged();
    } catch (err) {
      toast(err.message || "Couldn't close it.", "err");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="adm-cpr-edit is-open adm-cpr-close"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (valid) setConfirming(true);
      }}
    >
      <p className="adm-cpr-close-lead">
        Close it once PostEx shows it <strong>Closed</strong> (paid). Its delivered orders are then marked paid.
      </p>
      <label className="adm-field">
        <span>Amount received (Rs.)</span>
        <input
          className={`adm-input ${amount && !valid ? "bad" : ""}`}
          inputMode="decimal"
          value={amount}
          onChange={(ev) => {
            setAmount(ev.target.value.trim());
            setConfirming(false);
          }}
        />
        <span className="adm-hint">PostEx&apos;s figure is {signed(c.postex_amount)}. Change it to what PostEx actually paid.</span>
      </label>
      <label className="adm-field">
        <span>Note (optional)</span>
        <input
          className="adm-input"
          placeholder="e.g. as in the PostEx portal"
          maxLength={200}
          value={note}
          onChange={(ev) => setNote(ev.target.value)}
        />
      </label>
      <div className="adm-btns">
        {confirming ? (
          <>
            <button type="button" className="adm-btn primary" disabled={busy} onClick={close}>
              {c.to_mark > 0 ? `Close & mark ${orders} paid` : "Yes, close it"}
            </button>
            <button type="button" className="adm-btn" disabled={busy} onClick={() => setConfirming(false)}>
              Not yet
            </button>
          </>
        ) : (
          <button type="submit" className="adm-btn primary" disabled={!valid || busy}>
            Close CPR
          </button>
        )}
      </div>
    </form>
  );
}

// Closed by mistake: back to Generated, out of earnings, and the orders its
// closing marked paid go back to unpaid.
function ReopenCpr({ cpr: c, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <ConfirmButton
      className="adm-link adm-cpr-reopen"
      confirmLabel="Reopen? Its orders go back to unpaid"
      disabled={busy}
      onConfirm={async () => {
        setBusy(true);
        try {
          const r = await api.reopenCpr(c.cpr);
          toast(r.unmarked.length ? `${c.cpr} reopened · ${r.unmarked.length} ${r.unmarked.length === 1 ? "order" : "orders"} back to unpaid` : `${c.cpr} reopened`);
          onChanged();
        } catch (err) {
          toast(err.message || "Couldn't reopen it.", "err");
        } finally {
          setBusy(false);
        }
      }}
    >
      Reopen
    </ConfirmButton>
  );
}

// "Edit amount": the exact amount received for this CPR, with a note.
function CprAmount({ cpr: c, onChanged }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = AMOUNT.test(amount);

  const start = () => {
    setAmount(String(Math.round(c.amount)));
    setNote(c.note || "");
    setOpen(true);
  };
  const save = async (value, done) => {
    setBusy(true);
    try {
      await api.setCprAmount(c.cpr, value, value == null ? null : note.trim() || null);
      toast(done);
      setOpen(false);
      onChanged();
    } catch (err) {
      toast(err.message || "Couldn't save that.", "err");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="adm-cpr-edit">
        <button type="button" className="adm-link" onClick={start}>
          {c.adjusted ? "Change amount" : "Edit amount"}
        </button>
        {c.adjusted && (
          <button
            type="button"
            className="adm-link adm-cpr-reset"
            disabled={busy}
            onClick={() => save(null, "Back to PostEx's figure")}
          >
            Use PostEx&apos;s figure
          </button>
        )}
      </div>
    );
  }
  return (
    <form
      className="adm-cpr-edit is-open"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (valid) save(Number(amount), "Amount saved");
      }}
    >
      <label className="adm-field">
        <span>Amount you received (Rs.)</span>
        <input
          className={`adm-input ${amount && !valid ? "bad" : ""}`}
          inputMode="decimal"
          value={amount}
          onChange={(ev) => setAmount(ev.target.value.trim())}
          autoFocus
        />
        <span className="adm-hint">PostEx&apos;s figure is {signed(c.postex_amount)}.</span>
      </label>
      <label className="adm-field">
        <span>Note (optional)</span>
        <input
          className="adm-input"
          placeholder="e.g. after tax"
          maxLength={200}
          value={note}
          onChange={(ev) => setNote(ev.target.value)}
        />
      </label>
      <div className="adm-btns">
        <button type="submit" className="adm-btn primary" disabled={!valid || busy}>
          Save amount
        </button>
        <button type="button" className="adm-btn" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// Money received some other way, added by hand — plus a line for the orders
// handed over in person, which count by themselves.
function OtherEarnings({ entries, inPerson, onChanged }) {
  const [editing, setEditing] = useState(null); // null | "new" | entry
  return (
    <>
      <div className="adm-pay-head">
        <h2 className="adm-pay-h">Other earnings</h2>
        {editing !== "new" && (
          <button type="button" className="adm-btn" onClick={() => setEditing("new")}>
            Add an amount
          </button>
        )}
      </div>
      {editing === "new" && (
        <EntryForm
          onDone={() => {
            setEditing(null);
            onChanged();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      <ul className="adm-card flush adm-cpr-parcels is-standalone adm-earn-list">
        {inPerson.in_person_count > 0 && (
          <li>
            <span className="adm-cpr-parcel-main">
              <span>Orders handed over in person</span>
              <small>
                {inPerson.in_person_count} {inPerson.in_person_count === 1 ? "order" : "orders"} since 1 Jan 2026 ·
                counted automatically
              </small>
            </span>
            <b>{rs(inPerson.in_person)}</b>
          </li>
        )}
        {entries.map((entry) =>
          editing?.id === entry.id ? (
            <li key={entry.id} className="is-form">
              <EntryForm
                entry={entry}
                onDone={() => {
                  setEditing(null);
                  onChanged();
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={entry.id}>
              <span className="adm-cpr-parcel-main">
                <span>{entry.note}</span>
                <small>
                  {new Date(`${entry.earned_on}T12:00:00`).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
                  {" · "}
                  <button type="button" className="adm-link" onClick={() => setEditing(entry)}>
                    Edit
                  </button>
                </small>
              </span>
              <b>{rs(entry.amount)}</b>
            </li>
          )
        )}
        {inPerson.in_person_count === 0 && entries.length === 0 && (
          <li className="adm-earn-empty">
            <span className="adm-cpr-parcel-main">
              <small>Cash or transfers that didn&apos;t come through PostEx or an order. Add them here.</small>
            </span>
          </li>
        )}
      </ul>
    </>
  );
}

function EntryForm({ entry, onDone, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    earned_on: entry?.earned_on || today(),
    amount: entry ? String(Number(entry.amount)) : "",
    note: entry?.note || "",
  }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }));
  const amountOk = AMOUNT.test(form.amount.trim()) && Number(form.amount) > 0;
  const dateOk = form.earned_on >= "2000-01-01" && form.earned_on <= today();
  const valid = amountOk && dateOk && form.note.trim().length > 0;

  async function run(work, done) {
    setBusy(true);
    try {
      await work();
      toast(done);
      onDone();
    } catch (err) {
      toast(err.message || "Couldn't save that.", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="adm-card adm-earn-form"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (valid) {
          run(
            () => api.saveEarning(entry?.id, { earned_on: form.earned_on, amount: Number(form.amount), note: form.note.trim() }),
            entry ? "Amount updated" : "Amount added"
          );
        }
      }}
    >
      <div className="adm-earn-row">
        <label className="adm-field">
          <span>Amount (Rs.)</span>
          <input
            className={`adm-input ${form.amount && !amountOk ? "bad" : ""}`}
            inputMode="decimal"
            value={form.amount}
            onChange={set("amount")}
            autoFocus
          />
        </label>
        <label className="adm-field">
          <span>Date</span>
          <input
            className={`adm-input ${dateOk ? "" : "bad"}`}
            type="date"
            min="2000-01-01"
            max={today()}
            value={form.earned_on}
            onChange={set("earned_on")}
          />
        </label>
      </div>
      <label className="adm-field">
        <span>What it was</span>
        <input
          className="adm-input"
          placeholder="e.g. Cash sale at the studio"
          maxLength={200}
          value={form.note}
          onChange={set("note")}
        />
      </label>
      {!dateOk && <span className="adm-field-error">Choose a date up to today.</span>}
      {dateOk && form.earned_on < new Date(Date.now() - 30 * 864e5).toLocaleDateString("en-CA") && (
        <span className="adm-hint">Older than 30 days: it counts in All time, not in the last 30 days.</span>
      )}
      <div className="adm-btns">
        <button type="submit" className="adm-btn primary" disabled={!valid || busy}>
          {entry ? "Save" : "Add amount"}
        </button>
        <button type="button" className="adm-btn" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        {entry && (
          <ConfirmButton
            className="adm-btn danger adm-earn-delete"
            confirmLabel="Delete this amount?"
            disabled={busy}
            onConfirm={() => run(() => api.deleteEarning(entry.id), "Amount deleted")}
          >
            Delete
          </ConfirmButton>
        )}
      </div>
    </form>
  );
}

function Parcel({ parcel: p }) {
  const what = isDelivered(p)
    ? `${rs(p.cod)}${p.fee > 0 ? ` − ${rs(p.fee)} charge` : " collected"}`
    : /^return/i.test(p.status)
      ? `Returned · ${rs(p.return_fee)} return charge`
      : p.status;
  const from =
    p.booked_at && p.booked_at < STORE_START ? "Shopify store" : "booked in the PostEx portal";
  return (
    <li>
      <span className="adm-cpr-parcel-main">
        {p.order_id ? (
          <Link to={`/admin/orders/${p.order_id}`}>Order #{p.order_number}</Link>
        ) : (
          <span>
            Ref {p.ref || p.tracking} <small className="adm-cpr-from">· {from}</small>
          </span>
        )}
        <small>{what}</small>
      </span>
      <b className={p.net < 0 ? "is-neg" : ""}>{signed(p.net)}</b>
    </li>
  );
}
