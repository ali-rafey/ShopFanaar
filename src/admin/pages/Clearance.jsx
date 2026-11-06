import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../api";
import { thumb, totalStock } from "../../lib/catalog";
import { ActionSheet, ErrorBox, money, PageHead, ProductStatusBadge, Spinner, useLoad, useToast } from "../ui";

// Products → Clearance. The pieces listed under Clearance in the store's menu
// (the link only shows while at least one active piece is here), each at a
// clearance price with its full price struck through.
export default function Clearance() {
  const list = useLoad(() => api.listProducts(), []);
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);

  const all = list.data || [];
  const onClearance = all.filter((p) => p.collections.includes(api.CLEARANCE));
  const others = all.filter((p) => !p.collections.includes(api.CLEARANCE) && p.status !== "archived");

  async function run(work, done) {
    try {
      await work();
      toast(done);
    } catch (err) {
      toast(err.message || "Something went wrong.", "err");
    } finally {
      await list.reload();
    }
  }

  async function add(picked, cut) {
    await run(async () => {
      for (const p of picked) {
        await api.setClearance(p, { on: true, price: cut ? cutPrice(p, cut) : null });
      }
    }, `${picked.length} ${picked.length === 1 ? "piece" : "pieces"} on clearance`);
    setAdding(false);
  }

  const remove = (p, restore) => {
    setRemoving(null);
    run(() => api.setClearance(p, { on: false, restore }), `${p.title} taken off clearance`);
  };

  return (
    <>
      <PageHead
        back={<Link to="/admin/products" className="adm-back">Products</Link>}
        title="Clearance"
        sub="Pieces here are listed under Clearance in the store's menu, at their clearance price with the full price struck through. The menu link only shows while something is on clearance."
        actions={
          !adding &&
          list.data && (
            <button type="button" className="adm-btn primary" onClick={() => setAdding(true)}>
              Add pieces
            </button>
          )
        }
      />

      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.data === undefined ? (
        <Spinner />
      ) : (
        <>
          {adding && <AddPieces products={others} onAdd={add} onCancel={() => setAdding(false)} />}

          {onClearance.length === 0 ? (
            !adding && (
              <p className="adm-empty">
                Nothing on clearance. Add pieces and they appear in the store under Clearance, with the link in the menu.
              </p>
            )
          ) : (
            <ul className="adm-card flush adm-clr-list">
              {onClearance.map((p) => (
                <ClearanceRow
                  key={p.id}
                  product={p}
                  onSave={(price) => run(() => api.setClearance(p, { on: true, price }), `${p.title}: ${money(price)}`)}
                  onRemove={() => setRemoving(p)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {removing && (
        <ActionSheet
          title="Take off clearance"
          message={removing.title}
          onClose={() => setRemoving(null)}
          actions={
            removing.price < api.fullPrice(removing)
              ? [
                  { label: `Back to full price, ${money(api.fullPrice(removing))}`, onClick: () => remove(removing, true) },
                  { label: `Keep ${money(removing.price)}`, onClick: () => remove(removing, false) },
                ]
              : [{ label: "Take off clearance", destructive: true, onClick: () => remove(removing, false) }]
          }
        />
      )}
    </>
  );
}

// "30% off" → the full price less 30%, to the nearest Rs 10.
function cutPrice(product, percent) {
  const full = api.fullPrice(product);
  const price = Math.round((full * (100 - percent)) / 1000) * 10;
  return price > 0 && price < full ? price : null;
}

function ClearanceRow({ product: p, onSave, onRemove }) {
  const full = api.fullPrice(p);
  const [value, setValue] = useState(p.price < full ? String(p.price) : "");
  const [busy, setBusy] = useState(false);
  const n = Number(value);
  const valid = /^\d+$/.test(value) && n > 0 && n < full;
  const off = p.price < full ? Math.round((1 - p.price / full) * 100) : 0;
  const stock = totalStock(p);

  async function save(e) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    await onSave(n);
    setBusy(false);
  }

  return (
    <li className="adm-clr-row">
      <Link to={`/admin/products/${p.id}`} className="adm-thumb" aria-hidden="true" tabIndex={-1}>
        {p.images[0] && <img src={thumb(p.images[0])} alt="" loading="lazy" />}
      </Link>
      <div className="adm-clr-main">
        <div className="adm-clr-head">
          <Link to={`/admin/products/${p.id}`} className="adm-clr-title">
            {p.title}
          </Link>
          {p.status !== "active" && <ProductStatusBadge status={p.status} />}
          <button type="button" className="adm-link adm-clr-remove" onClick={onRemove}>
            Remove
          </button>
        </div>
        <small className="adm-clr-sub">
          {off ? (
            <>
              {money(p.price)} <s>{money(full)}</s> · {off}% off
            </>
          ) : (
            <>Full price {money(full)} · set a clearance price</>
          )}
          {" · "}
          {stock === 0 ? <span className="adm-out">Sold out</span> : `${stock} in stock`}
        </small>
        <form className="adm-clr-price" onSubmit={save}>
          <input
            className={`adm-input ${value && !valid ? "bad" : ""}`}
            inputMode="numeric"
            aria-label={`Clearance price for ${p.title}`}
            placeholder="Clearance price (Rs.)"
            value={value}
            onChange={(e) => setValue(e.target.value.trim())}
          />
          <button type="submit" className="adm-btn" disabled={!valid || busy || n === p.price}>
            Save
          </button>
        </form>
        {value && !valid && <span className="adm-field-error">Enter a whole number below {money(full)}.</span>}
      </div>
    </li>
  );
}

function AddPieces({ products, onAdd, onCancel }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [cut, setCut] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => !s || p.title.toLowerCase().includes(s) || p.handle.includes(s));
  }, [products, q]);
  const pct = Number(cut);
  const cutOk = cut === "" || (/^\d+$/.test(cut) && pct > 0 && pct < 100);
  const toggle = (id) =>
    setPicked((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  async function submit() {
    setBusy(true);
    await onAdd(
      products.filter((p) => picked.has(p.id)),
      cut ? pct : null
    );
    setBusy(false);
  }

  return (
    <section className="adm-card adm-clr-add" aria-label="Add pieces to clearance">
      <h2>Add pieces</h2>
      {products.length === 0 ? (
        <p className="adm-hint">Every product is already on clearance.</p>
      ) : (
        <>
          <input
            type="search"
            className="adm-search"
            placeholder="Search products"
            aria-label="Search products"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="adm-clr-pick">
            {rows.map((p) => {
              const stock = totalStock(p);
              return (
                <li key={p.id}>
                  <label className="adm-check">
                    <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                    <span className="adm-thumb">{p.images[0] && <img src={thumb(p.images[0])} alt="" loading="lazy" />}</span>
                    <span className="adm-clr-option">
                      {p.title}
                      <small>
                        {money(p.price)}
                        {p.status !== "active" && " · Draft, not on the store"}
                        {stock === 0 && " · Sold out"}
                      </small>
                    </span>
                  </label>
                </li>
              );
            })}
            {rows.length === 0 && <li className="adm-hint">No products match.</li>}
          </ul>
          <label className={`adm-field adm-clr-cut ${cutOk ? "" : "has-error"}`}>
            <span>Price cut (%)</span>
            <input inputMode="numeric" value={cut} onChange={(e) => setCut(e.target.value.trim())} />
            {cutOk ? (
              <span className="adm-hint">
                Optional. Lowers each piece&apos;s price by this much, to the nearest Rs 10. You can change each price
                afterwards.
              </span>
            ) : (
              <span className="adm-field-error">Enter a whole number from 1 to 99.</span>
            )}
          </label>
        </>
      )}
      <div className="adm-clr-actions">
        <button type="button" className="adm-btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        {products.length > 0 && (
          <button type="button" className="adm-btn primary" onClick={submit} disabled={!picked.size || !cutOk || busy}>
            {busy ? "Adding…" : picked.size ? `Add ${picked.size} ${picked.size === 1 ? "piece" : "pieces"}` : "Add pieces"}
          </button>
        )}
      </div>
    </section>
  );
}
