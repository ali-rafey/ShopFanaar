// Fanaar Accounts — the partners' private books, in a separate Supabase
// project (accounts/supabase/migrations) with its own sign-in. The sign-in is
// kept only until the app or tab is closed (sessionStorage), and is entirely
// separate from the store admin's.
//
// Without its keys: the dev demo keeps the books in this browser; a live
// site shows "not connected yet".
import { createClient } from "@supabase/supabase-js";
import { BACKEND as STORE_BACKEND } from "../api";
import { ApiError } from "../../lib/api";

const URL = import.meta.env.VITE_ACCOUNTS_SUPABASE_URL;
const KEY = import.meta.env.VITE_ACCOUNTS_SUPABASE_ANON_KEY;

export const BACKEND = URL && KEY ? "supabase" : STORE_BACKEND === "demo" ? "demo" : "off";

const sb =
  BACKEND === "supabase"
    ? createClient(URL, KEY, {
        auth: {
          storage: window.sessionStorage,
          storageKey: "fanaar-accounts-auth",
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

export const PARTNERS = ["Ali", "Ahmad", "Sarmad"];
export const EXPENSE_GROUPS = [
  {
    key: "business",
    label: "Business",
    categories: [
      ["fabric", "Fabric purchase"],
      ["production", "Production / stitching"],
      ["meta_ads", "Meta ads"],
    ],
  },
  {
    key: "other",
    label: "Other",
    categories: [
      ["wasted", "Wasted (parties etc.)"],
      ["other", "Anything else"],
    ],
  },
];
export const CATEGORY_LABEL = Object.fromEntries(EXPENSE_GROUPS.flatMap((g) => g.categories));

const TABLES = ["investments", "expenses", "rejected_stock", "abl_entries"];

function unwrap({ data, error }) {
  if (error) {
    let msg = error.message || "Something went wrong.";
    if (error.code === "42501" || /row-level security/i.test(msg)) msg = "This login isn't allowed to change the books.";
    if (error.code === "23514") msg = "Please check the amount.";
    throw new ApiError(msg, error.code);
  }
  return data;
}

// ------------------------------------------------------------------- sign-in

export async function getSession() {
  if (!sb) return demoDb().session;
  return unwrap(await sb.auth.getSession()).session;
}

export async function signIn(email, password) {
  if (!sb) {
    if (!email.trim() || !password) throw new ApiError("Enter your email and password.");
    demoWrite((d) => (d.session = { user: { email: email.trim() } }));
    return;
  }
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new ApiError(error.status === 400 ? "Wrong email or password." : error.message);
}

export async function signOut() {
  if (!sb) return demoWrite((d) => (d.session = null));
  await sb.auth.signOut();
}

// Signed in, but is this login one of the partners (public.members)?
export async function isMember() {
  if (!sb) return true;
  return unwrap(await sb.rpc("is_member")) === true;
}

// ------------------------------------------------------------------- books

// Everything, newest first: { investments, expenses, rejected_stock, abl_entries, cash }
export async function loadBooks() {
  if (!sb) {
    const d = demoDb();
    return { ...Object.fromEntries(TABLES.map((t) => [t, [...d[t]].reverse()])), cash: d.cash };
  }
  const lists = await Promise.all(
    TABLES.map((t) => sb.from(t).select("*").order("created_at", { ascending: false }).limit(5000).then(unwrap))
  );
  const cash = unwrap(await sb.from("cash_in_hand").select("amount,updated_at").eq("id", 1).maybeSingle());
  return { ...Object.fromEntries(TABLES.map((t, i) => [t, lists[i]])), cash: cash || { amount: 0 } };
}

export async function addEntry(table, row) {
  if (!TABLES.includes(table)) throw new Error(`Unknown book ${table}`);
  if (!sb) {
    return demoWrite((d) => {
      d[table].push({ id: crypto.randomUUID(), ...row, created_at: new Date().toISOString() });
    });
  }
  unwrap(await sb.from(table).insert(row));
}

export async function updateEntry(table, id, patch) {
  if (!TABLES.includes(table)) throw new Error(`Unknown book ${table}`);
  if (!sb) return demoWrite((d) => Object.assign(d[table].find((r) => r.id === id) || {}, patch));
  unwrap(await sb.from(table).update(patch).eq("id", id));
}

export async function removeEntry(table, id) {
  if (!TABLES.includes(table)) throw new Error(`Unknown book ${table}`);
  if (!sb) return demoWrite((d) => (d[table] = d[table].filter((r) => r.id !== id)));
  unwrap(await sb.from(table).delete().eq("id", id));
}

export async function setCashInHand(amount) {
  if (!sb) return demoWrite((d) => (d.cash = { amount, updated_at: new Date().toISOString() }));
  unwrap(await sb.from("cash_in_hand").update({ amount }).eq("id", 1));
}

// ------------------------------------------------------------- dev demo

const DEMO_KEY = "fanaar-accounts-demo-v1";
function demoDb() {
  try {
    const d = JSON.parse(localStorage.getItem(DEMO_KEY));
    if (d) return d;
  } catch {
    /* start fresh */
  }
  return { session: null, ...Object.fromEntries(TABLES.map((t) => [t, []])), cash: { amount: 0 } };
}
function demoWrite(fn) {
  const d = demoDb();
  fn(d);
  localStorage.setItem(DEMO_KEY, JSON.stringify(d));
}
