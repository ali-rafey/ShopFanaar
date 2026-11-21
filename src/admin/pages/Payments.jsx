import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../api";
import { ErrorBox, fmtDate, money, PageHead, Spinner, timeAgo, useLoad } from "../ui";

// Overview → Earnings → PostEx payments: every payment PostEx has made you
// (CPRs — cash payment receipts), from PostEx's own records. A CPR is
// "generated" when PostEx puts parcels into a payment and "closed" once it has
// paid it. The saved record shows straight away; the page then asks PostEx
// what's new (api.postexPayments) and refreshes.

const STORE_START = "2026-10-05"; // parcels booked before this came from the Shopify store
const rs = (n) => money(Math.round(Number(n) || 0));
const signed = (n) => (n < 0 ? `−${rs(-n)}` : rs(n));
const isDelivered = (p) => /^delivered$/i.test(p.status);

export default function Payments() {
  const report = useLoad(() => api.getPaymentsReport(), []);
  const [check, setCheck] = useState({ state: "checking" });
  const { reload } = report;

  useEffect(() => {
    let alive = true;
    api.postexPayments().then(
      (r) => {
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
  const firstTime = data && data.cprs.length === 0 && data.holding.count === 0;

  return (
    <>
      <PageHead
        back={<Link to="/admin" className="adm-back">Overview</Link>}
        title="PostEx payments"
        sub="Every payment PostEx has made you (CPRs), from PostEx's own records."
      />

      <CheckLine check={check} savedAt={data?.checked_at} />
      <ErrorBox error={report.error} onRetry={report.reload} />

      {!data ? (
        !report.error && <Spinner />
      ) : firstTime && check.state === "checking" ? (
        <p className="adm-empty">Getting every payment from PostEx. The first time takes a few seconds…</p>
      ) : (
        <>
          <section className="adm-pay-tiles" aria-label="Payments at a glance">
            <div className="adm-tile">
              <span className="adm-tile-label">Paid, last 30 days</span>
              <span className="adm-tile-value">{rs(data.paid_30d.amount)}</span>
              <span className="adm-tile-note">
                {data.paid_30d.count} {data.paid_30d.count === 1 ? "payment" : "payments"}
              </span>
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
            <div className="adm-tile">
              <span className="adm-tile-label">Paid in total</span>
              <span className="adm-tile-value">{rs(data.paid_all.amount)}</span>
              <span className="adm-tile-note">
                {data.paid_all.count} {data.paid_all.count === 1 ? "payment" : "payments"}
                {data.since && ` since ${new Date(data.since).toLocaleDateString("en-PK", { month: "short", year: "numeric" })}`}
              </span>
            </div>
          </section>

          <h2 className="adm-pay-h">Payments (CPRs)</h2>
          {data.cprs.length === 0 ? (
            <p className="adm-empty">PostEx hasn't made a payment yet.</p>
          ) : (
            <ul className="adm-cprs">
              {data.cprs.map((c) => (
                <Cpr key={c.cpr} cpr={c} />
              ))}
            </ul>
          )}

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
            Amounts are PostEx&apos;s own figures: the cash they collected minus their delivery and return charges.
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

function Cpr({ cpr: c }) {
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
          <div className="grand">
            <dt>{c.settled ? "Paid to you" : "To be paid"}</dt>
            <dd>{signed(c.amount)}</dd>
          </div>
        </dl>
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
