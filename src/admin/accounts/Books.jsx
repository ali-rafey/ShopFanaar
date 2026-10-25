import { useState } from "react";
import { Link } from "react-router-dom";
import * as books from "./api";
import { thumb } from "../../lib/catalog";
import { ConfirmButton, money, useToast } from "../ui";
import { parseAmount, pct, signed } from "./format";

// The four books of Fanaar Accounts. Each entry can be edited or deleted;
// dates aren't recorded (the partners keep it simple).

// Runs a change to the books with a toast, then reloads everything.
function useChange(onChange) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (fn, done) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
      await onChange();
      return true;
    } catch (err) {
      toast(err.message || "Something went wrong.", "err");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return [busy, run];
}

function Pills({ options, value, onChange, label }) {
  return (
    <div className="adm-pillset" role="radiogroup" aria-label={label}>
      {options.map(([key, text]) => (
        <button key={key} type="button" role="radio" aria-checked={value === key} className={value === key ? "is-on" : ""} onClick={() => onChange(key)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function AmountField({ label = "Amount (Rs)", value, onChange, autoFocus }) {
  return (
    <label className="adm-field">
      <span>{label}</span>
      <input inputMode="numeric" autoFocus={autoFocus} placeholder="e.g. 25,000" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function NoteField({ value, onChange, placeholder = "Optional", list }) {
  return (
    <label className="adm-field">
      <span>Note</span>
      <input value={value} maxLength={500} placeholder={placeholder} list={list} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// A row in a book: what it is, the amount, and Edit / Delete.
function Entry({ title, sub, amount, tone, busy, onDelete, editor }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <li className="acc-entry is-editing">{editor(() => setEditing(false))}</li>;
  return (
    <li className="acc-entry">
      <span className="acc-entry-main">
        <strong>{title}</strong>
        {sub && <small>{sub}</small>}
      </span>
      <span className={`acc-entry-amount ${tone || ""}`}>{amount}</span>
      <span className="acc-entry-actions">
        <button type="button" className="adm-link" disabled={busy} onClick={() => setEditing(true)}>
          Edit
        </button>
        <ConfirmButton className="adm-link danger" disabled={busy} confirmLabel="Delete?" onConfirm={onDelete}>
          Delete
        </ConfirmButton>
      </span>
    </li>
  );
}

const FormButtons = ({ busy, label, onCancel, disabled }) => (
  <div className="adm-btns">
    <button className="adm-btn primary" disabled={busy || disabled}>
      {busy ? "Saving…" : label}
    </button>
    {onCancel && (
      <button type="button" className="adm-btn" onClick={onCancel}>
        Cancel
      </button>
    )}
  </div>
);

// ---------------------------------------------------------------- investment

function InvestmentForm({ initial, busy, onSubmit, label, onCancel }) {
  const [partner, setPartner] = useState(initial?.partner || "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [note, setNote] = useState(initial?.note || "");
  const n = parseAmount(amount);
  return (
    <form
      className="acc-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onSubmit({ partner, amount: n, note: note.trim() || null })) {
          if (!initial) {
            setAmount("");
            setNote("");
          }
        }
      }}
    >
      <span className="acc-form-label">Who put money in?</span>
      <Pills label="Partner" options={books.PARTNERS.map((p) => [p, p])} value={partner} onChange={setPartner} />
      <div className="acc-form-row">
        <AmountField value={amount} onChange={setAmount} />
        <NoteField value={note} onChange={setNote} />
      </div>
      <FormButtons busy={busy} label={label} onCancel={onCancel} disabled={!partner || !(n > 0)} />
    </form>
  );
}

export function Investments({ list, sum, onChange }) {
  const [busy, run] = useChange(onChange);
  return (
    <>
      <section className="adm-card">
        <h2>Invested so far</h2>
        <ul className="acc-partners">
          {books.PARTNERS.map((p) => (
            <li key={p}>
              <span>{p}</span>
              <strong>{money(sum.byPartner[p])}</strong>
              <small>{sum.invested ? `${pct((sum.byPartner[p] / sum.invested) * 100)} share` : "—"}</small>
            </li>
          ))}
        </ul>
        <p className="acc-total">All time: <strong>{money(sum.invested)}</strong></p>
      </section>

      <section className="adm-card">
        <h2>Add an investment</h2>
        <InvestmentForm
          busy={busy}
          label="Add investment"
          onSubmit={(row) => run(() => books.addEntry("investments", row), `${row.partner}: ${money(row.amount)} added`)}
        />
      </section>

      <section className="adm-card">
        <h2>All investments</h2>
        {list.length === 0 ? (
          <p className="adm-empty">Nothing recorded yet.</p>
        ) : (
          <ul className="acc-list">
            {list.map((r) => (
              <Entry
                key={r.id}
                title={r.partner}
                sub={r.note}
                amount={money(r.amount)}
                busy={busy}
                onDelete={() => run(() => books.removeEntry("investments", r.id), "Investment deleted")}
                editor={(close) => (
                  <InvestmentForm
                    initial={r}
                    busy={busy}
                    label="Save"
                    onCancel={close}
                    onSubmit={async (row) => (await run(() => books.updateEntry("investments", r.id, row), "Saved")) && close()}
                  />
                )}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ expenses

function ExpenseForm({ initial, busy, onSubmit, label, onCancel }) {
  const [category, setCategory] = useState(initial?.category || "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [note, setNote] = useState(initial?.note || "");
  const n = parseAmount(amount);
  return (
    <form
      className="acc-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await onSubmit({ category, amount: n, note: note.trim() || null })) && !initial) {
          setAmount("");
          setNote("");
        }
      }}
    >
      {books.EXPENSE_GROUPS.map((g) => (
        <div key={g.key} className="acc-form-group">
          <span className="acc-form-label">{g.label}</span>
          <Pills label={g.label} options={g.categories} value={category} onChange={setCategory} />
        </div>
      ))}
      <div className="acc-form-row">
        <AmountField value={amount} onChange={setAmount} />
        <NoteField value={note} onChange={setNote} placeholder={category === "meta_ads" ? "e.g. October" : "Optional"} />
      </div>
      <FormButtons busy={busy} label={label} onCancel={onCancel} disabled={!category || !(n > 0)} />
    </form>
  );
}

export function Expenses({ list, sum, onChange }) {
  const [busy, run] = useChange(onChange);
  return (
    <>
      <section className="adm-card">
        <h2>Spent so far</h2>
        {books.EXPENSE_GROUPS.map((g) => (
          <dl key={g.key} className="adm-totals acc-group-totals">
            {g.categories.map(([key, label]) => (
              <div key={key}><dt>{label}</dt><dd>{money(sum.byCategory[key])}</dd></div>
            ))}
            <div className="grand">
              <dt>{g.label}</dt>
              <dd>{money(g.key === "business" ? sum.business : sum.otherSpend)}</dd>
            </div>
          </dl>
        ))}
        <p className="acc-total">All expenses: <strong>{money(sum.business + sum.otherSpend)}</strong></p>
      </section>

      <section className="adm-card">
        <h2>Add an expense</h2>
        <ExpenseForm
          busy={busy}
          label="Add expense"
          onSubmit={(row) =>
            run(() => books.addEntry("expenses", row), `${books.CATEGORY_LABEL[row.category]}: ${money(row.amount)} added`)
          }
        />
      </section>

      <section className="adm-card">
        <h2>All expenses</h2>
        {list.length === 0 ? (
          <p className="adm-empty">Nothing recorded yet.</p>
        ) : (
          <ul className="acc-list">
            {list.map((r) => (
              <Entry
                key={r.id}
                title={books.CATEGORY_LABEL[r.category]}
                sub={r.note}
                amount={money(r.amount)}
                busy={busy}
                onDelete={() => run(() => books.removeEntry("expenses", r.id), "Expense deleted")}
                editor={(close) => (
                  <ExpenseForm
                    initial={r}
                    busy={busy}
                    label="Save"
                    onCancel={close}
                    onSubmit={async (row) => (await run(() => books.updateEntry("expenses", r.id, row), "Saved")) && close()}
                  />
                )}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ----------------------------------------------------------------- inventory

const FAULTS = ["Stitching fault", "Fabric fault", "Wrong size", "Colour / print fault", "Damaged"];

function RejectedForm({ initial, articles, busy, onSubmit, label, onCancel }) {
  const [article, setArticle] = useState(initial?.article || "");
  const [fault, setFault] = useState(initial?.fault || "");
  const [pieces, setPieces] = useState(initial ? String(initial.pieces) : "");
  const [cost, setCost] = useState(initial ? String(initial.cost) : "");
  const p = parseAmount(pieces);
  const c = parseAmount(cost);
  return (
    <form
      className="acc-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await onSubmit({ article: article.trim(), fault: fault.trim() || null, pieces: p, cost: c })) && !initial) {
          setArticle("");
          setFault("");
          setPieces("");
          setCost("");
        }
      }}
    >
      <div className="acc-form-row">
        <label className="adm-field">
          <span>Article</span>
          <input value={article} list="acc-articles" placeholder="e.g. Yarn Dyed Tee" onChange={(e) => setArticle(e.target.value)} />
        </label>
        <label className="adm-field">
          <span>Type of fault</span>
          <input value={fault} list="acc-faults" placeholder="e.g. Stitching fault" onChange={(e) => setFault(e.target.value)} />
        </label>
      </div>
      <div className="acc-form-row">
        <label className="adm-field">
          <span>Pieces</span>
          <input inputMode="numeric" value={pieces} onChange={(e) => setPieces(e.target.value)} />
        </label>
        <AmountField label="Total cost lost (Rs)" value={cost} onChange={setCost} />
      </div>
      <datalist id="acc-articles">
        {articles.map((a) => <option key={a} value={a} />)}
      </datalist>
      <datalist id="acc-faults">
        {FAULTS.map((f) => <option key={f} value={f} />)}
      </datalist>
      <FormButtons busy={busy} label={label} onCancel={onCancel} disabled={!article.trim() || !(p > 0) || Number.isNaN(c)} />
    </form>
  );
}

export function Inventory({ stock, rejected, sum, onChange }) {
  const [busy, run] = useChange(onChange);
  const inStock = (stock?.products || []).filter((p) => p.pieces > 0);
  const articles = [...new Set((stock?.products || []).map((p) => p.title))];
  return (
    <>
      <section className="adm-card">
        <div className="adm-card-head">
          <h2>Listed / accepted stock</h2>
          <span className="acc-figure">{money(sum.stockValue)}</span>
        </div>
        <p className="adm-hint acc-lead">
          Pieces in stock × cost per piece, straight from Products. It goes down as orders take stock and up when returns
          are put back.
        </p>
        {!stock ? (
          <p className="adm-empty">Loading stock…</p>
        ) : inStock.length === 0 ? (
          <p className="adm-empty">No stock in Products right now.</p>
        ) : (
          <ul className="acc-stock">
            {inStock.map((p) => (
              <li key={p.id}>
                <div className="adm-thumb">{p.image && <img src={thumb(p.image)} alt="" />}</div>
                <span className="acc-stock-main">
                  <Link to={`/admin/products/${p.id}`}>{p.title}</Link>
                  {p.status !== "active" && <small className="acc-tag">{p.status}</small>}
                  <small>
                    {p.pieces} {p.pieces === 1 ? "piece" : "pieces"}
                    {p.cost != null ? ` × ${money(p.cost)}` : ""}
                  </small>
                </span>
                {p.cost != null ? (
                  <span className="acc-entry-amount">{money(p.value)}</span>
                ) : (
                  <Link to={`/admin/products/${p.id}`} className="acc-missing">
                    Add cost
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2>Rejected stock</h2>
          <span className="acc-figure is-loss">{signed(-sum.rejected)}</span>
        </div>
        <p className="adm-hint acc-lead">
          Pieces that came out faulty — their cost is lost. {sum.rejectedPieces} {sum.rejectedPieces === 1 ? "piece" : "pieces"} so far.
        </p>
        <RejectedForm
          articles={articles}
          busy={busy}
          label="Add rejected stock"
          onSubmit={(row) => run(() => books.addEntry("rejected_stock", row), `${row.article}: ${row.pieces} rejected`)}
        />
        {rejected.length > 0 && (
          <ul className="acc-list">
            {rejected.map((r) => (
              <Entry
                key={r.id}
                title={r.article}
                sub={[r.fault, `${r.pieces} ${r.pieces === 1 ? "piece" : "pieces"}`].filter(Boolean).join(" · ")}
                amount={signed(-Number(r.cost))}
                tone="is-loss"
                busy={busy}
                onDelete={() => run(() => books.removeEntry("rejected_stock", r.id), "Deleted")}
                editor={(close) => (
                  <RejectedForm
                    initial={r}
                    articles={articles}
                    busy={busy}
                    label="Save"
                    onCancel={close}
                    onSubmit={async (row) => (await run(() => books.updateEntry("rejected_stock", r.id, row), "Saved")) && close()}
                  />
                )}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ----------------------------------------------------------------------- ABL

const KIND = { in: "Money in", out: "Money out", correction: "Corrected to match the bank" };
const IN_NOTES = ["PostEx payout", "Cash sale deposited", "Investment deposited"];

function AblForm({ mode, balance, busy, onSubmit, onCancel, initial }) {
  const [amount, setAmount] = useState(initial ? String(Math.abs(initial.amount)) : "");
  const [note, setNote] = useState(initial?.note || "");
  const n = parseAmount(amount);
  const correcting = mode === "correction";
  return (
    <form
      className="acc-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const signedAmount = correcting ? n - balance : mode === "out" ? -n : n;
        if ((await onSubmit({ kind: mode, amount: signedAmount, note: note.trim() || null })) && !initial) {
          setAmount("");
          setNote("");
        }
      }}
    >
      <div className="acc-form-row">
        <AmountField label={correcting ? "Balance in the bank now (Rs)" : "Amount (Rs)"} value={amount} onChange={setAmount} autoFocus={!initial} />
        <NoteField value={note} onChange={setNote} list={mode === "in" ? "acc-in-notes" : undefined} placeholder={mode === "in" ? "e.g. PostEx payout" : "Optional"} />
      </div>
      <datalist id="acc-in-notes">
        {IN_NOTES.map((t) => <option key={t} value={t} />)}
      </datalist>
      {correcting && !Number.isNaN(n) && (
        <p className="adm-hint">
          {n === balance ? "Already matches." : `Adds a correction of ${signed(n - balance)}.`}
        </p>
      )}
      <FormButtons
        busy={busy}
        label={initial ? "Save" : correcting ? "Correct the balance" : mode === "out" ? "Take money out" : "Add money in"}
        onCancel={onCancel}
        disabled={correcting ? Number.isNaN(n) || n === balance : !(n > 0)}
      />
    </form>
  );
}

export function Abl({ list, cash, sum, onChange }) {
  const [busy, run] = useChange(onChange);
  const [mode, setMode] = useState(null); // in | out | correction
  const [cashText, setCashText] = useState(null); // editing cash in hand
  return (
    <>
      <section className="adm-card acc-balance">
        <span className="acc-hero-label">Fanaar Account ABL</span>
        <strong className={`acc-hero-value ${sum.abl < 0 ? "is-loss" : ""}`}>{signed(sum.abl)}</strong>
        <div className="adm-btns">
          {[
            ["in", "+ Money in"],
            ["out", "− Money out"],
            ["correction", "Match the bank"],
          ].map(([key, label]) => (
            <button key={key} type="button" className={`adm-btn ${mode === key ? "primary" : ""}`} onClick={() => setMode(mode === key ? null : key)}>
              {label}
            </button>
          ))}
        </div>
        {mode && (
          <AblForm
            key={mode}
            mode={mode}
            balance={sum.abl}
            busy={busy}
            onCancel={() => setMode(null)}
            onSubmit={async (row) => {
              const done = row.kind === "correction" ? "Balance corrected" : row.kind === "out" ? "Money out recorded" : "Money in recorded";
              const ok = await run(() => books.addEntry("abl_entries", row), done);
              if (ok) setMode(null);
              return ok;
            }}
          />
        )}
      </section>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2>Cash in hand</h2>
          {cashText === null && (
            <button type="button" className="adm-link" onClick={() => setCashText(String(cash?.amount || 0))}>
              Edit
            </button>
          )}
        </div>
        {cashText === null ? (
          <p className="acc-figure">{money(sum.cash)}</p>
        ) : (
          <form
            className="acc-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => books.setCashInHand(parseAmount(cashText)), "Cash in hand saved")) setCashText(null);
            }}
          >
            <AmountField label="Cash in hand now (Rs)" value={cashText} onChange={setCashText} autoFocus />
            <FormButtons busy={busy} label="Save" onCancel={() => setCashText(null)} disabled={Number.isNaN(parseAmount(cashText))} />
          </form>
        )}
        <p className="adm-hint">Money from sales not yet deposited into ABL. Counts towards what Fanaar owns.</p>
      </section>

      <section className="adm-card">
        <h2>All entries</h2>
        {list.length === 0 ? (
          <p className="adm-empty">Nothing recorded yet. Start with “Match the bank” to enter today&apos;s balance.</p>
        ) : (
          <ul className="acc-list">
            {list.map((r) => (
              <Entry
                key={r.id}
                title={KIND[r.kind]}
                sub={r.note}
                amount={`${r.amount > 0 ? "+" : ""}${signed(Number(r.amount))}`}
                tone={r.amount < 0 ? "is-loss" : "is-gain"}
                busy={busy}
                onDelete={() => run(() => books.removeEntry("abl_entries", r.id), "Entry deleted")}
                editor={(close) =>
                  r.kind === "correction" ? (
                    <NoteEditor
                      initial={r.note}
                      busy={busy}
                      onCancel={close}
                      onSubmit={async (note) => (await run(() => books.updateEntry("abl_entries", r.id, { note }), "Saved")) && close()}
                    />
                  ) : (
                    <AblForm
                      mode={r.kind}
                      initial={r}
                      balance={sum.abl}
                      busy={busy}
                      onCancel={close}
                      onSubmit={async (row) =>
                        (await run(() => books.updateEntry("abl_entries", r.id, { amount: row.amount, note: row.note }), "Saved")) && close()
                      }
                    />
                  )
                }
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// A correction is worked out from the bank balance at the time, so only its
// note can change — delete it and match the bank again to redo it.
function NoteEditor({ initial, busy, onSubmit, onCancel }) {
  const [note, setNote] = useState(initial || "");
  return (
    <form
      className="acc-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(note.trim() || null);
      }}
    >
      <NoteField value={note} onChange={setNote} />
      <FormButtons busy={busy} label="Save" onCancel={onCancel} />
    </form>
  );
}
