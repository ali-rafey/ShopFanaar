import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="wrap about">
      <h1>Page Not Found</h1>
      <p>The page you're looking for doesn't exist or has moved.</p>
      <Link
        to="/"
        className="btn-dark"
        style={{
          display: "inline-block",
          width: "auto",
          padding: "14px 34px",
          marginTop: 24,
        }}
      >
        Return Home
      </Link>
    </div>
  );
}
