import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useFeed } from "../AdminApp";
import * as api from "../api";
import { ConfirmButton, ErrorBox, fmtDate, PageHead, Spinner, timeAgo, useLoad, useToast } from "../ui";

const TABS = [
  ["", "Messages"],
  ["archived", "Archived"],
  ["subscribers", "Subscribers"],
];

export default function Inbox() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "";
  const { stats } = useFeed();

  return (
    <>
      <PageHead title="Inbox" sub="Messages from the contact page and newsletter sign-ups." />
      <div className="adm-tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "on" : ""}
            onClick={() => setParams(key ? { tab: key } : {})}
          >
            {label}
            {key === "" && stats?.unread_messages > 0 && <span>{stats.unread_messages} new</span>}
            {key === "subscribers" && stats && <span>{stats.subscribers}</span>}
          </button>
        ))}
      </div>
      {tab === "subscribers" ? <Subscribers /> : <Messages archived={tab === "archived"} />}
    </>
  );
}

function Messages({ archived }) {
  const toast = useToast();
  const { refreshStats } = useFeed();
  const list = useLoad(() => api.listMessages(archived ? "archived" : undefined), [archived]);

  async function act(fn, msg) {
    try {
      await fn();
      if (msg) toast(msg);
      list.reload();
      refreshStats();
    } catch (e) {
      toast(e.message || "Something went wrong.", "err");
    }
  }

  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;
  if (!list.data) return <Spinner />;
  if (!list.data.length) {
    return <p className="adm-empty">{archived ? "Nothing archived." : "No messages yet. Messages from /pages/contact land here."}</p>;
  }

  return (
    <ul className="adm-messages">
      {list.data.map((m) => {
        const wa = m.phone && m.phone.replace(/\D/g, "").replace(/^0/, "92");
        return (
          <li key={m.id} className={`adm-card adm-message ${m.status === "new" ? "is-new" : ""}`}>
            <div className="adm-message-head">
              <div>
                <strong>{m.name}</strong>
                {m.status === "new" && <span className="adm-badge s-pending">New</span>}
                {m.order_number && (
                  <Link className="adm-link" to={`/admin/orders?q=${m.order_number}`}>
                    Order #{m.order_number}
                  </Link>
                )}
              </div>
              <time dateTime={m.created_at} title={fmtDate(m.created_at)}>{timeAgo(m.created_at)}</time>
            </div>
            <p className="adm-message-body">{m.message}</p>
            <div className="adm-btns">
              {wa && (
                <a className="adm-btn wa" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                  WhatsApp {m.phone}
                </a>
              )}
              {m.email && (
                <a className="adm-btn" href={`mailto:${m.email}?subject=${encodeURIComponent("Re: your message to Fanaar")}`}>
                  Email {m.email}
                </a>
              )}
              {m.status === "new" && (
                <button className="adm-btn" onClick={() => act(() => api.setMessageStatus(m.id, "read"))}>
                  Mark read
                </button>
              )}
              {m.status !== "archived" ? (
                <button className="adm-btn" onClick={() => act(() => api.setMessageStatus(m.id, "archived"), "Archived")}>
                  Archive
                </button>
              ) : (
                <button className="adm-btn" onClick={() => act(() => api.setMessageStatus(m.id, "read"), "Moved to inbox")}>
                  Unarchive
                </button>
              )}
              <ConfirmButton className="adm-btn danger" confirmLabel="Delete?" onConfirm={() => act(() => api.deleteMessage(m.id), "Deleted")}>
                Delete
              </ConfirmButton>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Subscribers() {
  const toast = useToast();
  const { refreshStats } = useFeed();
  const list = useLoad(() => api.listSubscribers(), []);
  const [copied, setCopied] = useState(false);

  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;
  if (!list.data) return <Spinner />;
  const rows = list.data;

  function download() {
    const csv = "email,subscribed_at\n" + rows.map((r) => `${r.email},${r.created_at}`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `fanaar-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copy() {
    await navigator.clipboard.writeText(rows.map((r) => r.email).join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <div className="adm-toolbar">
        <button className="adm-btn" onClick={download} disabled={!rows.length}>
          Download CSV
        </button>
        <button className="adm-btn" onClick={copy} disabled={!rows.length}>
          {copied ? "Copied" : "Copy all emails"}
        </button>
      </div>
      {!rows.length ? (
        <p className="adm-empty">No subscribers yet. Sign-ups from the home page newsletter land here.</p>
      ) : (
        <div className="adm-card flush">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Joined</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.email}</td>
                  <td className="muted">{fmtDate(r.created_at, false)}</td>
                  <td className="num">
                    <ConfirmButton
                      className="adm-link danger"
                      confirmLabel="Remove?"
                      onConfirm={async () => {
                        try {
                          await api.deleteSubscriber(r.id);
                          toast("Removed");
                          list.reload();
                          refreshStats();
                        } catch (e) {
                          toast(e.message, "err");
                        }
                      }}
                    >
                      Remove
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
