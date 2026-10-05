import { useState } from "react";
import { subscribe } from "../lib/api";
import { trackLead } from "../lib/pixel";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | done | already | error
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const result = await subscribe(email.trim());
      setState(result === "already" ? "already" : "done");
      if (result !== "already") trackLead();
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setState("error");
    }
  }

  if (state === "done" || state === "already") {
    return (
      <p className="join-done" role="status">
        {state === "done"
          ? "You're on the list. We'll be in touch when something new is ready."
          : "You're already on the list — thank you."}
      </p>
    );
  }

  return (
    <>
      <form className="join-form" onSubmit={onSubmit}>
        <input
          type="email"
          placeholder="Enter your email"
          aria-label="Email address"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" disabled={state === "sending"}>
          {state === "sending" ? "Joining…" : "Subscribe"}
        </button>
      </form>
      {state === "error" && (
        <p className="join-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
