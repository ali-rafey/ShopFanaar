import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="wrap empty-state" style={{ padding: "140px 0" }}>
      <span className="eyebrow">Error 404</span>
      <h1 className="empty-lead">This page doesn&apos;t exist.</h1>
      <p className="empty-sub">
        The link may be broken, or the piece has moved on.
      </p>
      <Link to="/" className="btn-solid">
        Return home
      </Link>
    </div>
  );
}
