import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../AdminApp";
import { BACKEND } from "../api";
import { Spinner } from "../ui";

export default function Login() {
  const auth = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (auth.status === "loading") return <Spinner />;
  if (auth.status === "admin") {
    return <Navigate to={location.state?.from?.pathname || "/admin"} replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await auth.signIn(email.trim(), password);
    } catch (err) {
      setError(err.message || "Couldn't sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-center">
      <form className="adm-card adm-login" onSubmit={onSubmit}>
        <img src="/logo.png" alt="Fanaar" className="adm-login-logo" />
        <h1>Store admin</h1>
        {BACKEND === "demo" && (
          <p className="adm-sub">Demo mode: any email and password will sign you in.</p>
        )}
        <label className="adm-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="adm-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required={BACKEND !== "demo"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <div className="adm-error" role="alert">
            {error}
          </div>
        )}
        <button className="adm-btn primary full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
