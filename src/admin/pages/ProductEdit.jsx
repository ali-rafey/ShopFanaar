import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../api";
import { prepareImage } from "../image";
import { defaultSizeChart } from "../../data/store";
import { toSizeChart } from "../../lib/catalog";
import { ConfirmButton, ErrorBox, PageHead, Spinner, useLoad, useToast } from "../ui";

const DEFAULT_DISCLAIMER =
  "Color tones may appear slightly different in imagery due to lighting conditions and display variations.";
const QUICK_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const HANDLE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const slugify = (s) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const chartForm = (c) => ({
  note: c?.note || "",
  columns: [...(c?.columns || [])],
  rows: (c?.rows || []).map((r) => ({ size: r.size, values: [...r.values] })),
});
const NO_CHART = { note: "", columns: [], rows: [] };

// Editor keeps numbers as strings so fields can be cleared while typing.
function toForm(p) {
  return {
    title: p.title,
    handle: p.handle,
    description: p.description,
    disclaimer: p.disclaimer || "",
    price: String(p.price ?? ""),
    compareAtPrice: p.compareAtPrice ? String(p.compareAtPrice) : "",
    images: [...p.images],
    collections: [...p.collections],
    status: p.status,
    position: String(p.position ?? 0),
    sizes: p.sizes.map((s) => ({ id: s.id, size: s.size, qty: String(s.qty), sku: s.sku || "" })),
    chart: chartForm(p.sizeChart),
  };
}

const BLANK = {
  title: "",
  handle: "",
  description: "",
  disclaimer: DEFAULT_DISCLAIMER,
  price: "",
  compareAtPrice: "",
  images: [],
  collections: [],
  status: "draft",
  position: "0",
  sizes: ["S", "M", "L"].map((size) => ({ size, qty: "0", sku: "" })),
  chart: chartForm(defaultSizeChart),
};

const int = (s) => (/^\d+$/.test(String(s).trim()) ? Number(String(s).trim()) : NaN);

function validate(f) {
  const e = {};
  if (!f.title.trim()) e.title = "Give the product a name.";
  if (!HANDLE_RE.test(f.handle)) e.handle = "Use lowercase letters, numbers and dashes only.";
  if (Number.isNaN(int(f.price))) e.price = "Enter a whole number of rupees.";
  if (f.compareAtPrice && Number.isNaN(int(f.compareAtPrice))) e.compareAtPrice = "Enter a whole number, or leave empty.";
  const seen = new Set();
  f.sizes.forEach((s, i) => {
    const k = s.size.trim().toUpperCase();
    if (!k) e[`size${i}`] = "Size name needed.";
    else if (seen.has(k)) e[`size${i}`] = "Duplicate size.";
    seen.add(k);
    if (Number.isNaN(int(s.qty))) e[`qty${i}`] = "0 or more.";
  });
  if (f.status === "active" && f.sizes.length === 0) e.sizes = "Active products need at least one size.";
  if (f.status === "active" && f.images.length === 0) e.images = "Active products need at least one photo.";
  f.chart.columns.forEach((c, i) => {
    if (!c.trim()) e[`chartCol${i}`] = "Name it, or remove it.";
  });
  const chartSizes = new Set();
  f.chart.rows.forEach((r, i) => {
    const k = r.size.trim().toUpperCase();
    if (!k) e[`chartRow${i}`] = "Size needed.";
    else if (chartSizes.has(k)) e[`chartRow${i}`] = "Duplicate size.";
    chartSizes.add(k);
  });
  if (f.chart.rows.length && !f.chart.columns.length) e.chart = "Add at least one measurement column.";
  return e;
}

export default function ProductEdit() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();

  const res = useLoad(
    () => Promise.all([isNew ? null : api.getProduct(id), api.listCollections(), api.listProducts()]),
    [id]
  );
  const original = res.data?.[0] || null;
  const collections = res.data?.[1] || [];
  const chartSources = (res.data?.[2] || []).filter((p) => p.id !== id && p.sizeChart);

  const [form, setForm] = useState(null);
  const [initial, setInitial] = useState(null);
  const [handleTouched, setHandleTouched] = useState(!isNew);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!res.data) return;
    const f = original ? toForm(original) : BLANK;
    setForm(f);
    setInitial(f);
    setHandleTouched(!isNew);
    setErrors({});
  }, [res.data, original, isNew]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (res.error) return <ErrorBox error={res.error} onRetry={res.reload} />;
  if (!form) return <Spinner />;
  if (!isNew && !original) {
    return (
      <p className="adm-empty">
        Product not found. <Link to="/admin/products" className="adm-link">Back to products</Link>
      </p>
    );
  }

  const set = (k, v) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "title" && !handleTouched) next.handle = slugify(v);
      return next;
    });
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const setSize = (i, k, v) =>
    setForm((f) => ({ ...f, sizes: f.sizes.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }));
  // Editing one cell clears that cell's error; adding or removing rows and
  // columns shifts positions, so it clears every chart error.
  const updateChart = (fn, errorKey) => {
    setForm((f) => ({ ...f, chart: fn(f.chart) }));
    setErrors((e) =>
      errorKey
        ? { ...e, [errorKey]: undefined }
        : Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith("chart")))
    );
  };

  async function onFiles(files) {
    const list = [...files];
    if (!list.length) return;
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        const blob = await prepareImage(file);
        const url = await api.uploadImage(blob, form.handle || "products");
        setForm((f) => ({ ...f, images: [...f.images, url] }));
        setErrors((e) => ({ ...e, images: undefined }));
      } catch (err) {
        toast(err.message || `Couldn't upload ${file.name}.`, "err");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function removeImage(url) {
    set("images", form.images.filter((u) => u !== url));
    // Uploaded during this edit and never saved — delete the file right away.
    if (!initial.images.includes(url)) api.removeImages([url]);
  }

  function moveImage(i, dir) {
    const imgs = [...form.images];
    const j = i + dir;
    if (j < 0 || j >= imgs.length) return;
    [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
    set("images", imgs);
  }

  async function save() {
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) {
      toast("Please fix the highlighted fields.", "err");
      return;
    }
    setSaving(true);
    try {
      const product = {
        id: original?.id,
        title: form.title,
        handle: form.handle,
        description: form.description.trim(),
        disclaimer: form.disclaimer.trim(),
        price: int(form.price),
        compareAtPrice: form.compareAtPrice ? int(form.compareAtPrice) : null,
        images: form.images,
        collections: form.collections,
        status: form.status,
        position: int(form.position) || 0,
        sizes: form.sizes.map((s) => ({ id: s.id, size: s.size.trim(), qty: int(s.qty), sku: s.sku })),
        sizeChart: toSizeChart(form.chart),
      };
      const savedId = await api.saveProduct(product, original);
      const dropped = (original?.images || []).filter((u) => !form.images.includes(u));
      if (dropped.length) api.removeImages(dropped);
      toast(isNew ? "Product created" : "Product saved");
      if (isNew) navigate(`/admin/products/${savedId}`, { replace: true });
      else await res.reload();
    } catch (err) {
      toast(err.message || "Couldn't save.", "err");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await api.deleteProduct(original);
      toast("Product deleted");
      navigate("/admin/products", { replace: true });
    } catch (err) {
      toast(err.message || "Couldn't delete.", "err");
    }
  }

  const missingQuick = QUICK_SIZES.filter(
    (q) => !form.sizes.some((s) => s.size.trim().toUpperCase() === q)
  );

  return (
    <div className="adm-editor">
      <PageHead
        back={<Link to="/admin/products" className="adm-back">Products</Link>}
        title={isNew ? "New product" : original.title}
        actions={
          !isNew &&
          original.status === "active" && (
            <a className="adm-btn" href={`/products/${original.handle}`} target="_blank" rel="noreferrer">
              View on store ↗
            </a>
          )
        }
      />

      <div className="adm-detail">
        <div className="adm-detail-main">
          <section className="adm-card">
            <Field label="Title" error={errors.title}>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label="Description">
              <textarea rows={6} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
            <Field label="Disclaimer" hint="Shown under the description on the product page.">
              <textarea rows={2} value={form.disclaimer} onChange={(e) => set("disclaimer", e.target.value)} />
            </Field>
          </section>

          <section className="adm-card">
            <div className="adm-card-head">
              <h2>Photos</h2>
              <span className="adm-hint">First photo is the cover. Resized &amp; converted to WebP on upload.</span>
            </div>
            {errors.images && <p className="adm-field-error">{errors.images}</p>}
            <div className="adm-images">
              {form.images.map((url, i) => (
                <figure key={url} className="adm-image">
                  <img src={url} alt={`Photo ${i + 1}`} />
                  {i === 0 && <span className="adm-image-cover">Cover</span>}
                  <div className="adm-image-tools">
                    <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} aria-label="Move left">←</button>
                    <button type="button" onClick={() => moveImage(i, 1)} disabled={i === form.images.length - 1} aria-label="Move right">→</button>
                    <button type="button" onClick={() => removeImage(url)} aria-label="Remove photo">✕</button>
                  </div>
                </figure>
              ))}
              {Array.from({ length: uploading }, (_, i) => (
                <div key={`u${i}`} className="adm-image uploading">Uploading…</div>
              ))}
              <button type="button" className="adm-image add" onClick={() => fileRef.current?.click()}>
                + Add photos
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  onFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          </section>

          <section className="adm-card">
            <h2>Pricing</h2>
            <div className="adm-row">
              <Field label="Price (Rs.)" error={errors.price}>
                <input inputMode="numeric" value={form.price} onChange={(e) => set("price", e.target.value)} />
              </Field>
              <Field
                label="Compare-at price (Rs.)"
                hint="Optional. Shown struck through to mark a sale."
                error={errors.compareAtPrice}
              >
                <input inputMode="numeric" value={form.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="adm-card">
            <div className="adm-card-head">
              <h2>Sizes &amp; stock</h2>
              <span className="adm-hint">Stock goes down automatically with every order.</span>
            </div>
            {errors.sizes && <p className="adm-field-error">{errors.sizes}</p>}
            <div className="adm-table-scroll">
              <table className="adm-table adm-size-table">
                <thead>
                  <tr>
                    <th>Size</th>
                    <th>In stock</th>
                    <th>SKU <span className="muted">(optional)</span></th>
                    <th aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {form.sizes.map((s, i) => (
                    <tr key={s.id || `new${i}`}>
                      <td>
                        <input
                          className={`adm-input ${errors[`size${i}`] ? "bad" : ""}`}
                          value={s.size}
                          onChange={(e) => setSize(i, "size", e.target.value)}
                          aria-label="Size"
                        />
                        {errors[`size${i}`] && <span className="adm-field-error">{errors[`size${i}`]}</span>}
                      </td>
                      <td>
                        <div className="adm-stepper">
                          <button type="button" onClick={() => setSize(i, "qty", String(Math.max(0, (int(s.qty) || 0) - 1)))} aria-label="Decrease stock">−</button>
                          <input
                            className={`adm-input ${errors[`qty${i}`] ? "bad" : ""}`}
                            inputMode="numeric"
                            value={s.qty}
                            onChange={(e) => setSize(i, "qty", e.target.value)}
                            aria-label={`Stock for size ${s.size}`}
                          />
                          <button type="button" onClick={() => setSize(i, "qty", String((int(s.qty) || 0) + 1))} aria-label="Increase stock">+</button>
                        </div>
                      </td>
                      <td>
                        <input className="adm-input" value={s.sku} onChange={(e) => setSize(i, "sku", e.target.value)} aria-label="SKU" />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="adm-link danger"
                          onClick={() => set("sizes", form.sizes.filter((_, j) => j !== i))}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="adm-btns">
              <button type="button" className="adm-btn" onClick={() => set("sizes", [...form.sizes, { size: "", qty: "0", sku: "" }])}>
                + Add size
              </button>
              {missingQuick.map((q) => (
                <button
                  type="button"
                  key={q}
                  className="adm-chip"
                  onClick={() => set("sizes", [...form.sizes, { size: q, qty: "0", sku: "" }])}
                >
                  + {q}
                </button>
              ))}
            </div>
          </section>

          <SizeChartCard
            chart={form.chart}
            update={updateChart}
            errors={errors}
            stockSizes={form.sizes.map((s) => s.size.trim()).filter(Boolean)}
            sources={chartSources}
          />
        </div>

        <div className="adm-detail-side">
          <section className="adm-card">
            <h2>Visibility</h2>
            <Field label="Status">
              <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="active">Active — on the store</option>
                <option value="draft">Draft — hidden</option>
                <option value="archived">Archived — hidden</option>
              </select>
            </Field>
          </section>

          <section className="adm-card">
            <h2>Collections</h2>
            <div className="adm-checks">
              {collections.map((c) => (
                <label key={c.handle} className="adm-check">
                  <input
                    type="checkbox"
                    checked={form.collections.includes(c.handle)}
                    onChange={(e) =>
                      set(
                        "collections",
                        e.target.checked
                          ? [...form.collections, c.handle]
                          : form.collections.filter((h) => h !== c.handle)
                      )
                    }
                  />
                  {c.title}
                </label>
              ))}
            </div>
            <p className="adm-hint">The first one ticked is used for the product&apos;s breadcrumb.</p>
          </section>

          <section className="adm-card">
            <h2>Search &amp; ordering</h2>
            <Field label="URL handle" error={errors.handle} hint={`shopfanaar.com/products/${form.handle || "…"}`}>
              <input
                value={form.handle}
                onChange={(e) => {
                  setHandleTouched(true);
                  set("handle", e.target.value.toLowerCase());
                }}
              />
            </Field>
            <Field label="Sort position" hint="Lower numbers show first.">
              <input inputMode="numeric" value={form.position} onChange={(e) => set("position", e.target.value)} />
            </Field>
          </section>

          {!isNew && (
            <section className="adm-card">
              <h2>Delete</h2>
              <p className="adm-hint">
                Past orders keep their item details. To just hide it, set the status to Archived instead.
              </p>
              <ConfirmButton confirmLabel="Yes, delete forever" onConfirm={remove}>
                Delete product
              </ConfirmButton>
            </section>
          )}
        </div>
      </div>

      <div className={`adm-savebar ${dirty || isNew ? "show" : ""}`}>
        <span>{isNew ? "New product" : "Unsaved changes"}</span>
        <div className="adm-btns">
          {!isNew && (
            <button type="button" className="adm-btn" onClick={() => setForm(initial)} disabled={saving}>
              Discard
            </button>
          )}
          <button type="button" className="adm-btn primary" onClick={save} disabled={saving || uploading > 0}>
            {saving ? "Saving…" : uploading ? "Uploading photos…" : isNew ? "Create product" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SizeChartCard({ chart, update, errors, stockSizes, sources }) {
  const { columns, rows } = chart;
  const hasChart = Boolean(chart.note.trim() || columns.length || rows.length);
  const missing = stockSizes.filter(
    (s) => !rows.some((r) => r.size.trim().toUpperCase() === s.toUpperCase())
  );

  const setColumn = (c, v) =>
    update((ch) => ({ ...ch, columns: ch.columns.map((x, j) => (j === c ? v : x)) }), `chartCol${c}`);
  const addColumn = () =>
    update((ch) => ({
      ...ch,
      columns: [...ch.columns, ""],
      rows: ch.rows.map((r) => ({ ...r, values: [...r.values, ""] })),
    }));
  const removeColumn = (c) =>
    update((ch) => ({
      ...ch,
      columns: ch.columns.filter((_, j) => j !== c),
      rows: ch.rows.map((r) => ({ ...r, values: r.values.filter((_, j) => j !== c) })),
    }));
  const setRowSize = (i, v) =>
    update((ch) => ({ ...ch, rows: ch.rows.map((r, j) => (j === i ? { ...r, size: v } : r)) }), `chartRow${i}`);
  const setCell = (i, c, v) =>
    update((ch) => ({
      ...ch,
      rows: ch.rows.map((r, j) => (j === i ? { ...r, values: r.values.map((x, k) => (k === c ? v : x)) } : r)),
    }), "chart");
  const addRow = (size = "") =>
    update((ch) => ({ ...ch, rows: [...ch.rows, { size, values: ch.columns.map(() => "") }] }));
  const removeRow = (i) => update((ch) => ({ ...ch, rows: ch.rows.filter((_, j) => j !== i) }));

  function copyFrom(value) {
    const source = value === "standard" ? defaultSizeChart : sources.find((p) => p.id === value)?.sizeChart;
    if (source) update(() => chartForm(source));
  }

  return (
    <section className="adm-card">
      <div className="adm-card-head">
        <h2>Size chart</h2>
        <span className="adm-hint">Shown under “Size guide” on the product page.</span>
      </div>

      <Field label="Fit note" hint="Optional. A line above the chart, e.g. how the piece fits.">
        <textarea rows={2} value={chart.note} onChange={(e) => update((ch) => ({ ...ch, note: e.target.value }), "chart")} />
      </Field>

      {columns.length || rows.length ? (
        <div className="adm-table-scroll">
          <table className="adm-table adm-size-table adm-chart">
            <thead>
              <tr>
                <th>Size</th>
                {columns.map((c, ci) => (
                  <th key={ci}>
                    <div className="adm-chart-col">
                      <input
                        className={`adm-input ${errors[`chartCol${ci}`] ? "bad" : ""}`}
                        value={c}
                        placeholder="e.g. Chest (in)"
                        onChange={(e) => setColumn(ci, e.target.value)}
                        aria-label={`Column ${ci + 1} name`}
                      />
                      <button type="button" className="adm-chart-x" onClick={() => removeColumn(ci)} aria-label={`Remove column ${c || ci + 1}`}>
                        ✕
                      </button>
                    </div>
                    {errors[`chartCol${ci}`] && <span className="adm-field-error">{errors[`chartCol${ci}`]}</span>}
                  </th>
                ))}
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <input
                      className={`adm-input ${errors[`chartRow${i}`] ? "bad" : ""}`}
                      value={r.size}
                      onChange={(e) => setRowSize(i, e.target.value)}
                      aria-label={`Row ${i + 1} size`}
                    />
                    {errors[`chartRow${i}`] && <span className="adm-field-error">{errors[`chartRow${i}`]}</span>}
                  </td>
                  {r.values.map((v, ci) => (
                    <td key={ci}>
                      <input
                        className="adm-input"
                        value={v}
                        onChange={(e) => setCell(i, ci, e.target.value)}
                        aria-label={`${columns[ci] || `Column ${ci + 1}`} for size ${r.size || i + 1}`}
                      />
                    </td>
                  ))}
                  <td>
                    <button type="button" className="adm-chart-x" onClick={() => removeRow(i)} aria-label={`Remove size ${r.size || i + 1}`}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="adm-hint adm-chart-empty">
          {chart.note.trim()
            ? "No measurements — the product page shows the fit note only."
            : "No size chart — the product page won’t show a size guide."}
        </p>
      )}
      {errors.chart && <p className="adm-field-error">{errors.chart}</p>}

      <div className="adm-btns">
        <button type="button" className="adm-btn" onClick={() => addRow()}>
          + Add row
        </button>
        <button type="button" className="adm-btn" onClick={addColumn}>
          + Add column
        </button>
        {missing.map((s) => (
          <button type="button" key={s} className="adm-chip" onClick={() => addRow(s)}>
            + {s}
          </button>
        ))}
      </div>

      <div className="adm-chart-foot">
        <select className="adm-input" value="" onChange={(e) => copyFrom(e.target.value)} aria-label="Copy a size chart">
          <option value="">Copy a chart from…</option>
          <option value="standard">Standard Fanaar chart</option>
          {sources.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        {hasChart && (
          <button type="button" className="adm-link danger" onClick={() => update(() => NO_CHART)}>
            Remove chart
          </button>
        )}
      </div>
    </section>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <label className={`adm-field ${error ? "has-error" : ""}`}>
      <span>{label}</span>
      {children}
      {error ? <span className="adm-field-error">{error}</span> : hint && <span className="adm-hint">{hint}</span>}
    </label>
  );
}
