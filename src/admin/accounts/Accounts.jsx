import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import * as store from "../api";
import * as books from "./api";
import { ApiError } from "../../lib/api";
import { ErrorBox, money, PageHead, Spinner, useLoad } from "../ui";
import { Abl, Expenses, Inventory, Investments } from "./Books";
import { pct, signed, sumOf as total } from "./format";
import "./accounts.css";

// Fanaar Accounts: are we in profit, at break-even or at a loss?
//
//   What Fanaar owns now = ABL balance + listed stock (at cost) + cash in hand
//   Status               = what Fanaar owns − total invested
//
// Expenses and rejected stock aren't subtracted again — that money has already
// left the ABL account. They only show where the investment went.
const TABS = [
  ["status", "Status"],
  ["investment", "Investment"],
  ["expenses", "Expenses"],
  ["inventory", "Inventory"],
  ["abl", "Fanaar Account ABL"],
];

export default function Accounts() {
  const [auth, setAuth] = useState({ status: books.BACKEND === "off" ? "off" : "loading" });

  const check = useCallback(async () => {
    try {
      const session = await books.getSession();
      if (!session) return setAuth({ status: "signedOut" });
      const member = await books.isMember();
      setAuth({ status: member ? "in" : "denied", email: session.user?.email });
    } catch (err) {
      setAuth({ status: "signedOut", error: err.message });
    }
  }, []);
  useEffect(() => {
    if (books.BACKEND !== "off") check();
  }, [check]);

  const lock = async () => {
    await books.signOut();
    setAuth({ status: "signedOut" });
  };

  const head = (actions) => (
    <PageHead
      back={<Link to="/admin/settings" className="adm-back">Settings</Link>}
      title="Fanaar Accounts"
      sub="Private books for Ali, Ahmad and Sarmad."
      actions={actions}
    />
  );

  if (auth.status === "off") {
    return (
      <>
        {head()}
        <section className="adm-card">
          <h2>Not connected yet</h2>
          <p className="adm-sub">
            Fanaar Accounts uses its own private database. It switches on once that project&apos;s keys are added to
            the website.
          </p>
        </section>
      </>
    );
  }
  if (auth.status === "loading") return <Spinner />;
  if (auth.status !== "in") {
    return (
      <>
        {head()}
        <SignIn denied={auth.status === "denied" ? auth.email : null} onDone={check} onSignOut={lock} />
      </>
    );
  }
  return <Books head={head} onLock={lock} />;
}

function SignIn({ denied, onDone, onSignOut }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (denied) {
    return (
      <section className="adm-card acc-signin">
        <h2>Not one of the partners</h2>
        <p className="adm-sub">{denied} can sign in, but isn&apos;t allowed to see Fanaar&apos;s accounts.</p>
        <button className="adm-btn" onClick={onSignOut}>
          Sign out
        </button>
      </section>
    );
  }

  return (
    <form
      className="adm-card acc-signin"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await books.signIn(email, password);
          setPassword("");
          await onDone();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Couldn't sign in. Try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Sign in to Fanaar Accounts</h2>
      <p className="adm-sub">A separate login from the store admin. You stay signed in until you close the app.</p>
      <label className="adm-field">
        <span>Email</span>
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="adm-field">
        <span>Password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <p className="adm-field-error">{error}</p>}
      <button className="adm-btn primary" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

// ------------------------------------------------------------------- books

function Books({ head, onLock }) {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get("tab")) ? params.get("tab") : "status";
  const data = useLoad(() => books.loadBooks(), []);
  const stock = useLoad(() => store.inventoryValue(), []);
  const sum = useMemo(() => (data.data ? summarize(data.data, stock.data) : null), [data.data, stock.data]);
  const reload = useCallback(() => Promise.all([data.reload(), stock.reload()]), [data, stock]);

  return (
    <>
      {head(
        <button className="adm-btn" onClick={onLock}>
          Lock
        </button>
      )}
      <div className="adm-tabs acc-tabs" role="tablist" aria-label="Accounts">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "on" : ""}
            onClick={() => setParams(key === "status" ? {} : { tab: key }, { replace: true })}
          >
            {label}
          </button>
        ))}
      </div>

      <ErrorBox error={data.error || stock.error} onRetry={reload} />
      {!sum ? (
        !data.error && <Spinner />
      ) : tab === "investment" ? (
        <Investments list={data.data.investments} sum={sum} onChange={reload} />
      ) : tab === "expenses" ? (
        <Expenses list={data.data.expenses} sum={sum} onChange={reload} />
      ) : tab === "inventory" ? (
        <Inventory stock={stock.data} rejected={data.data.rejected_stock} sum={sum} onChange={reload} />
      ) : tab === "abl" ? (
        <Abl list={data.data.abl_entries} cash={data.data.cash} sum={sum} onChange={reload} />
      ) : (
        <Status sum={sum} stockLoading={!stock.data && !stock.error} />
      )}
    </>
  );
}

// Every figure the portal shows, from the books and the store's stock.
function summarize(b, stock) {
  const invested = total(b.investments);
  const byPartner = Object.fromEntries(
    books.PARTNERS.map((p) => [p, total(b.investments.filter((r) => r.partner === p))])
  );
  const byCategory = Object.fromEntries(
    Object.keys(books.CATEGORY_LABEL).map((c) => [c, total(b.expenses.filter((r) => r.category === c))])
  );
  const abl = total(b.abl_entries);
  const cash = Number(b.cash?.amount || 0);
  const stockValue = Number(stock?.total_value || 0);
  const owns = abl + stockValue + cash;
  const position = owns - invested;
  let state = "none";
  if (invested > 0) state = Math.abs(position) <= invested * 0.01 ? "even" : position > 0 ? "profit" : "loss";
  return {
    invested,
    byPartner,
    byCategory,
    business: byCategory.fabric + byCategory.production + byCategory.meta_ads,
    otherSpend: byCategory.wasted + byCategory.other,
    rejected: total(b.rejected_stock, "cost"),
    rejectedPieces: total(b.rejected_stock, "pieces"),
    abl,
    cash,
    stockValue,
    stockPieces: Number(stock?.total_pieces || 0),
    missingCost: Number(stock?.missing_cost || 0),
    owns,
    position,
    pct: invested > 0 ? (position / invested) * 100 : null,
    state,
  };
}

function Status({ sum: s, stockLoading }) {
  const headline = {
    none: ["Add your investments", "Your status shows once the money you've put in is recorded."],
    profit: ["In profit", `${pct(s.pct)} more than you invested`],
    even: ["Break-even", "Within 1% of what you invested"],
    loss: ["At a loss", `${pct(s.pct)} less than you invested`],
  }[s.state];

  const spent = [
    ["Business", null],
    ["Fabric purchase", s.byCategory.fabric],
    ["Production / stitching", s.byCategory.production],
    ["Meta ads", s.byCategory.meta_ads],
    ["Other", null],
    ["Wasted (parties etc.)", s.byCategory.wasted],
    ["Anything else", s.byCategory.other],
  ];
  const scale = Math.max(s.invested, s.business + s.otherSpend, 1);

  return (
    <>
      <section className={`adm-card acc-hero is-${s.state}`}>
        <span className="acc-hero-label">{headline[0]}</span>
        {s.state !== "none" && <strong className="acc-hero-value">{signed(s.position)}</strong>}
        <span className="acc-hero-sub">{headline[1]}</span>
      </section>

      <div className="acc-cols">
        <section className="adm-card">
          <h2>What Fanaar owns now</h2>
          <dl className="adm-totals">
            <div><dt>Fanaar Account ABL</dt><dd>{signed(s.abl)}</dd></div>
            <div>
              <dt>Listed stock at cost</dt>
              <dd>{stockLoading ? "…" : money(s.stockValue)}</dd>
            </div>
            <div><dt>Cash in hand</dt><dd>{money(s.cash)}</dd></div>
            <div className="grand"><dt>Total</dt><dd>{signed(s.owns)}</dd></div>
            <div><dt>Total invested</dt><dd>−{money(s.invested)}</dd></div>
            <div className="grand acc-position"><dt>{headline[0]}</dt><dd>{signed(s.position)}</dd></div>
          </dl>
          {s.missingCost > 0 && (
            <p className="acc-warn">
              {s.missingCost} {s.missingCost === 1 ? "product in stock has" : "products in stock have"} no cost per piece
              yet, so {s.missingCost === 1 ? "it counts" : "they count"} as Rs 0. Add the cost in{" "}
              <Link to="/admin/products">Products</Link>.
            </p>
          )}
        </section>

        <section className="adm-card">
          <h2>Who invested</h2>
          <ul className="acc-partners">
            {books.PARTNERS.map((p) => (
              <li key={p}>
                <span>{p}</span>
                <strong>{money(s.byPartner[p])}</strong>
                <small>{s.invested ? pct((s.byPartner[p] / s.invested) * 100) : "—"}</small>
              </li>
            ))}
          </ul>
          <p className="acc-total">All time: <strong>{money(s.invested)}</strong></p>
        </section>
      </div>

      <section className="adm-card">
        <h2>Where the money went</h2>
        <ul className="acc-bars">
          {spent.map(([label, amount]) =>
            amount === null ? (
              <li key={label} className="acc-bars-group">
                {label}
                <span>{money(label === "Business" ? s.business : s.otherSpend)}</span>
              </li>
            ) : (
              <li key={label}>
                <span className="acc-bars-label">{label}</span>
                <span className="acc-bars-track" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (amount / scale) * 100)}%` }} />
                </span>
                <span className="acc-bars-amount">{money(amount)}</span>
              </li>
            )
          )}
          <li className="acc-bars-group">
            Rejected stock
            <span>{money(s.rejected)}</span>
          </li>
          <li className="acc-bars-note">
            {s.rejectedPieces} {s.rejectedPieces === 1 ? "piece" : "pieces"} lost — part of what production cost.
          </li>
        </ul>
        <p className="adm-hint">
          These are already out of the ABL account, so they aren&apos;t subtracted again — they show where the
          investment went.
        </p>
      </section>
    </>
  );
}
