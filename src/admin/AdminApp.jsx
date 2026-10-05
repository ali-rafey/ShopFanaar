import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate, Link } from "react-router-dom";
import * as api from "./api";
import { ToastProvider, Spinner, useToast } from "./ui";
import { registerWorker, setBadge } from "./push";
import { playOrderSound } from "./sound";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import Products from "./pages/Products";
import ProductEdit from "./pages/ProductEdit";
import Settings from "./pages/Settings";
import Inbox from "./pages/Inbox";
import "./admin.css";

// ---------------------------------------------------------------- auth state

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  // status: loading | signedOut | denied | admin
  const [auth, setAuth] = useState({ status: "loading", user: null });

  const resolve = useCallback(async (session) => {
    if (!session) return setAuth({ status: "signedOut", user: null });
    try {
      const ok = await api.checkIsAdmin();
      setAuth({ status: ok ? "admin" : "denied", user: session.user });
    } catch {
      setAuth({ status: "denied", user: session.user });
    }
  }, []);

  useEffect(() => {
    api.getSession().then(resolve, () => setAuth({ status: "signedOut", user: null }));
    return api.onAuthChange((session) => resolve(session));
  }, [resolve]);

  const value = {
    ...auth,
    signIn: async (email, password) => {
      await api.signIn(email, password);
      await resolve(await api.getSession());
    },
    signOut: async () => {
      await api.signOut();
      setAuth({ status: "signedOut", user: null });
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ------------------------------------------------- live order feed + counts

const FeedContext = createContext(null);
export const useFeed = () => useContext(FeedContext);

function FeedProvider({ children }) {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [version, setVersion] = useState(0); // bumps on any order change
  const seen = useRef(new Set());

  const refreshStats = useCallback(() => api.getStats().then(setStats, () => {}), []);

  useEffect(() => {
    refreshStats();
    return api.subscribeOrders((payload) => {
      setVersion((v) => v + 1);
      refreshStats();
      const o = payload?.new;
      if (payload?.eventType === "INSERT" && o && !seen.current.has(o.id)) {
        seen.current.add(o.id);
        toast(`New order #${o.order_number} — ${o.customer_name}`, "new");
        playOrderSound();
      }
    });
  }, [refreshStats, toast]);

  const pending = stats?.by_status?.pending || 0;
  useEffect(() => {
    document.title = `${pending ? `(${pending}) ` : ""}Fanaar Admin`;
    if (stats) setBadge(pending); // home-screen icon badge when installed
  }, [pending, stats]);

  // Service worker: keeps notifications working and opens the tapped order.
  const navigate = useNavigate();
  useEffect(() => {
    registerWorker();
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e) => {
      if (e.data?.type === "open" && e.data.url) {
        const u = new URL(e.data.url, window.location.origin);
        navigate(u.pathname + u.search);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);

  return (
    <FeedContext.Provider value={{ stats, refreshStats, version }}>{children}</FeedContext.Provider>
  );
}

// ----------------------------------------------------------------- layout

function Icon({ d }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV = [
  { to: "/admin", end: true, label: "Overview", icon: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 7h6V4h-6z" },
  { to: "/admin/orders", label: "Orders", icon: "M6 7h12l-1 13H7L6 7zm3 0V5.5a3 3 0 0 1 6 0V7", badge: "pending" },
  { to: "/admin/products", label: "Products", icon: "M4 7l8-4 8 4-8 4-8-4zm0 0v10l8 4 8-4V7M12 11v10" },
  { to: "/admin/inbox", label: "Inbox", icon: "M4 13h4l2 3h4l2-3h4M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5z", badge: "unread" },
  { to: "/admin/settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" },
];

function Layout() {
  const { user, signOut } = useAuth();
  const { stats } = useFeed();
  const badges = {
    pending: stats?.by_status?.pending || 0,
    unread: stats?.unread_messages || 0,
  };

  return (
    <div className="adm-shell">
      <aside className="adm-side">
        <Link to="/admin" className="adm-brand">
          <img src="/logo.png" alt="" />
          <span>Admin</span>
        </Link>
        <nav className="adm-nav" aria-label="Admin">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="adm-navlink">
              <Icon d={n.icon} />
              <span>{n.label}</span>
              {n.badge && badges[n.badge] > 0 && (
                <span className="adm-pill" aria-label={`${badges[n.badge]} ${n.badge}`}>
                  {badges[n.badge]}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="adm-side-foot">
          <a href="/" target="_blank" rel="noreferrer" className="adm-navlink subtle">
            <Icon d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
            <span>View store</span>
          </a>
          <div className="adm-user">
            <span title={user?.email}>{user?.email}</span>
            <button className="adm-link" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="adm-main">
        {api.BACKEND === "demo" && (
          <div className="adm-demo-banner">
            Demo mode — no Supabase keys yet, so data lives only in this browser. Add the keys
            to <code>.env.local</code> to go live.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}

function RequireAdmin() {
  const { status, user, signOut } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Spinner />;
  if (status === "signedOut") return <Navigate to="/admin/login" replace state={{ from: location }} />;
  if (status === "denied") {
    return (
      <div className="adm-center">
        <div className="adm-card adm-login">
          <h1>No admin access</h1>
          <p className="adm-sub">
            {user?.email} is signed in but isn&apos;t listed as an admin. Ask the store owner to add
            this account, or sign in with a different one.
          </p>
          <button className="adm-btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }
  return (
    <FeedProvider>
      <Layout />
    </FeedProvider>
  );
}

function NotConfigured() {
  return (
    <div className="adm-center">
      <div className="adm-card adm-login">
        <h1>Admin not connected</h1>
        <p className="adm-sub">
          This deployment has no database configured. Set <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> in Vercel → Project → Settings → Environment
          Variables, then redeploy.
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- app

export default function AdminApp() {
  // Keep the admin out of search engines.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    document.body.classList.add("adm-body");
    return () => {
      meta.remove();
      document.body.classList.remove("adm-body");
    };
  }, []);

  if (api.BACKEND === "static") return <NotConfigured />;

  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="login" element={<Login />} />
          <Route element={<RequireAdmin />}>
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="products" element={<Products />} />
            <Route path="products/new" element={<ProductEdit />} />
            <Route path="products/:id" element={<ProductEdit />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </ToastProvider>
  );
}
