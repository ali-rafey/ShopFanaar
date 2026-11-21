import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../api";
import { ConfirmButton, ErrorBox, fmtDate, money, PageHead, Spinner, timeAgo, useLoad, useToast } from "../ui";

// Overview → Earnings: the money received since 1 Jan 2026 — PostEx payments
// (CPRs, cash payment receipts), orders handed over in person, and amounts
// the admin adds. A CPR is "generated" when PostEx puts parcels into a
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
  const { reload } = report;

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
        setCheck({ state: "done", at: r.checkedAt, failed: r.failed });
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
        sub="Money received since 1 Jan 2026: PostEx payments, orders handed over in person, and amounts you add."
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
              <span className="adm-tile-label">Since Jan 2026</span>
              <span className="adm-tile-value">{rs(e.all.total)}</span>
              <span className="adm-tile-note">{breakdown(e.all)}</span>
            </div>
            <div className="adm-tile">
              <span className="adm-tile-label">Generated</span>
              <span className="adm-tile-value">{rs(data.generated.amount)}</span>
              <span className="adm-tile-note">
                {data.generated.count
                  ? `${data.generated.count} ${data.generated.count === 1 ? "CPR" : "CPRs"}, not paid yet`
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
            A CPR counts at PostEx&apos;s own figure (cash collected minus their charges) until you enter the amount
            you received. Orders handed over in person count at their total on the day they were marked delivered.
          </p>
        </>
      )}
    </>
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
      {check.failed > 0 && ` · ${check.failed} ${check.failed === 1 ? "parcel" : "parcels"} couldn't be checked, next time will`}
    </p>
  );
}

function Cpr({ cpr: c, onChanged }) {
  const facts = [
    c.settled ? `Paid ${fmtDate(c.settled_at)}` : `Generated ${fmtDate(c.generated_at)} · not paid yet`,
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
            <span className={`adm-stage ${c.settled ? "adm-stage-order" : "adm-stage-checkout"}`}>
              {c.settled ? "Closed" : "Generated"}
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
                {c.settled ? "You received" : "You expect"}
                {c.note && <small className="adm-cpr-note">{c.note}</small>}
              </dt>
              <dd>{signed(c.amount)}</dd>
            </div>
          )}
        </dl>
        <CprAmount cpr={c} onChanged={onChanged} />
        <ul className="adm-cpr-parcels">
          {c.parcels.map((p) => (
            <Parcel key={p.tracking} parcel={p} />
          ))}
        </ul>
        <p className="adm-cpr-foot">
          Generated {fmtDate(c.generated_at)}
          {c.settled && c.settled_at ? ` · closed ${fmtDate(c.settled_at)}` : ""}
        </p>
      </details>
    </li>
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
  const dateOk = form.earned_on >= "2026-01-01" && form.earned_on <= today();
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
            min="2026-01-01"
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
      {!dateOk && <span className="adm-field-error">Choose a date from 1 Jan 2026 up to today.</span>}
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
