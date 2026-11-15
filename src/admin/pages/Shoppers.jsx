import { Link, useSearchParams } from "react-router-dom";
import * as api from "../api";
import Funnel from "../Funnel";
import { countryName, deviceName, flag, pageName, placeName } from "../names";
import { ErrorBox, fmtDate, money, PageHead, Spinner, timeAgo, useLoad } from "../ui";

// Overview → Shoppers. What each visitor did on the store in the last 30 days
// (api.getShopperJourneys): where they are, how they arrived, the pieces they
// added, whether they reached the checkout, and whether they ordered. The
// store records these under a random browser id, never a name — a shopper's
// details only exist once they place an order.

const DAYS = 30;
const TABS = [
  { stage: "", label: "All shoppers" },
  { stage: "cart", label: "Added to cart" },
  { stage: "checkout", label: "Started checkout" },
  { stage: "order", label: "Completed checkout" },
];
const STAGE = {
  cart: { label: "Left it in the cart", tone: "cart" },
  checkout: { label: "Left at checkout", tone: "checkout" },
  order: { label: "Ordered", tone: "order" },
};

export default function Shoppers() {
  const [params, setParams] = useSearchParams();
  const stage = TABS.some((t) => t.stage === params.get("stage")) ? params.get("stage") : "";
  const funnel = useLoad(() => api.getShopperFunnel(DAYS), []);
  const list = useLoad(() => api.getShopperJourneys({ days: DAYS, stage: stage || null }), [stage]);
  const setStage = (s) => setParams(s ? { stage: s } : {}, { replace: true });

  return (
    <>
      <PageHead
        back={<Link to="/admin" className="adm-back">Overview</Link>}
        title="Shoppers"
        sub={`What visitors did on the store in the last ${DAYS} days: where they came from, what they added to their cart and how far they got.`}
      />

      <section className="adm-card" aria-label="Steps shoppers took">
        <ErrorBox error={funnel.error} onRetry={funnel.reload} />
        {funnel.data ? <Funnel data={funnel.data} /> : !funnel.error && <p className="adm-empty">Loading…</p>}
      </section>

      <div className="adm-tabs" role="tablist" aria-label="Filter shoppers">
        {TABS.map((t) => (
          <button
            key={t.stage}
            role="tab"
            aria-selected={stage === t.stage}
            className={stage === t.stage ? "on" : ""}
            onClick={() => setStage(t.stage)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.data === undefined ? (
        <Spinner />
      ) : list.data.length === 0 ? (
        <p className="adm-empty">
          {stage ? "Nobody got this far in the last 30 days." : "No shopper has added anything to a cart yet. Journeys appear here as soon as one does."}
        </p>
      ) : (
        <>
          <ul className="adm-journeys">
            {list.data.map((j) => (
              <Journey key={`${j.key}-${j.first_at}`} journey={j} />
            ))}
          </ul>
          <p className="adm-hint">
            Shoppers are known by their browser only, not by name. One row is one browser; the code is
            the same wherever that browser appears.
          </p>
        </>
      )}
    </>
  );
}

function Journey({ journey: j }) {
  const stage = STAGE[j.stage] || STAGE.cart;
  const views = j.events.filter((e) => e.kind === "view").length;
  const added = j.events.filter((e) => e.kind === "cart").reduce((n, e) => n + (e.qty || 1), 0);
  const where = j.country ? `${flag(j.country)} ${placeName(j)}` : "Location unknown";
  const facts = [
    `${views} ${views === 1 ? "page" : "pages"}`,
    added > 0 && `added ${added} ${added === 1 ? "piece" : "pieces"}`,
    j.visits > 1 && `${ordinal(j.visits)} visit`,
    timeAgo(j.last_at),
  ].filter(Boolean);

  return (
    <li className="adm-journey">
      <details>
        <summary>
          <span className="adm-journey-main">
            <span className="adm-journey-title" title={j.city ? `${j.city}, ${countryName(j.country)}` : undefined}>
              {where} · {deviceName(j.device)}
              {j.source && j.source !== "Direct" && <> · {j.source}</>}
            </span>
            <span className="adm-journey-sub">{facts.join(" · ")}</span>
          </span>
          <span className="adm-journey-side">
            <span className={`adm-stage adm-stage-${stage.tone}`}>{stage.label}</span>
            {j.value > 0 && <b>{money(j.value)}</b>}
          </span>
        </summary>
        <ol className="adm-trail">
          {j.events.map((e, i) => {
            const step = stepLabel(e);
            return (
              <li key={i} className={`is-${e.kind}`}>
                <time dateTime={e.at}>{fmtDate(e.at)}</time>
                <span>
                  {step.text}
                  {step.detail && <small>{step.detail}</small>}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="adm-trail-foot">
          Browser {j.key}
          {j.source && <> · arrived via {j.source}</>}
          {j.visits > 0 && <> · {j.visits} {j.visits === 1 ? "visit" : "visits"} in all</>}
        </p>
      </details>
    </li>
  );
}

function stepLabel(e) {
  if (e.kind === "cart") {
    return {
      text: `Added ${e.title || "a piece"} to the cart`,
      detail: [e.size && `Size ${e.size}`, e.qty > 1 && `×${e.qty}`, e.price != null && money(e.price * (e.qty || 1))]
        .filter(Boolean)
        .join(" · "),
    };
  }
  if (e.kind === "checkout") {
    return {
      text: `Opened the checkout · ${e.count} ${e.count === 1 ? "piece" : "pieces"} · ${money(e.value)}`,
      detail: (e.items || [])
        .map((i) => `${i.title}${i.size ? ` ${i.size}` : ""}${i.qty > 1 ? ` ×${i.qty}` : ""}`)
        .join(", "),
    };
  }
  if (e.kind === "order") return { text: `Placed an order · ${money(e.value)}` };
  const path = e.path || "/";
  if (path === "/") return { text: "Opened the homepage" };
  const name = pageName({ path, title: e.title });
  const [, kind] = path.split("/");
  if (kind === "products") return { text: `Looked at ${name}` };
  if (kind === "collections") return { text: `Browsed ${name.replace("Collection · ", "")}` };
  return { text: `Opened ${name}` };
}

const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
