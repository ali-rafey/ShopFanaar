// Daily (vercel.json "crons"): Supabase pauses a free project after a week
// without activity, and Fanaar Accounts may go unopened for longer. This asks
// its database for public.ping() — it reads nothing. Does nothing until the
// accounts project's keys are set.
export default async function handler(req, res) {
  const url = process.env.VITE_ACCOUNTS_SUPABASE_URL;
  const key = process.env.VITE_ACCOUNTS_SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(200).json({ ok: false, reason: "Fanaar Accounts isn't connected yet." });
  try {
    const r = await fetch(`${url}/rest/v1/rpc/ping`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10000),
    });
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  } catch {
    return res.status(502).json({ ok: false });
  }
}
