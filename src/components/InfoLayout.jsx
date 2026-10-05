import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { infoPages } from "../data/store";

// Shared frame for Contact / Shipping / Returns / Privacy.
export default function InfoLayout({ eyebrow, title, lead, updated, wide, children }) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} — Fanaar`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div className="wrap info">
      <nav className="chip-row info-tabs" aria-label="Customer information">
        {infoPages.map((p) => (
          <NavLink key={p.to} to={p.to} className={({ isActive }) => `chip ${isActive ? "active" : ""}`}>
            {p.label}
          </NavLink>
        ))}
      </nav>
      <header className="info-head">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {lead && <p className="info-lead">{lead}</p>}
      </header>
      <div className={`info-body ${wide ? "wide" : ""}`}>{children}</div>
      {updated && <p className="info-updated">Last updated {updated}</p>}
    </div>
  );
}

export function InfoSection({ title, children }) {
  return (
    <section className="info-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
