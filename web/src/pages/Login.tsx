import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CardFace } from "../components/CardFace";
import { useAuth } from "../state/AuthContext";
import { ApiError } from "../lib/api";

const DEMO_USERS = [
  { email: "alice@example.com", label: "Alice (Luffy Fan)" },
  { email: "bob@example.com", label: "Bob (Zoro Fan)" },
  { email: "carol@example.com", label: "Carol (Nami Fan)" },
];
const DEMO_PASSWORD = "password123";

export function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, displayName);
      }
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function quickSignIn(demoEmail: string) {
    setError(null);
    setBusy(true);
    try {
      await login(demoEmail, DEMO_PASSWORD);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in as demo user");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-intro">
        <p className="eyebrow">Cards Collect</p>
        <h1>Know what you own. Find the trade that finishes the set.</h1>
        <p className="muted">
          Track copies, conditions, and duplicates. Propose a trade or a donation without sharing your email or where
          you are.
        </p>
        <div className="auth-faces" aria-hidden="true">
          <CardFace number="HA01-001" name="Lantern Keeper" rarity="Common" ink="Sea" />
          <CardFace number="HA01-020" name="Braid Keeper" rarity="Legendary" ink="Sea" />
          <CardFace number="SV01-010" name="Helmsman's Steady Hand" rarity="C" />
        </div>
      </div>
      <div className="card auth-card">
        <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>

        <div className="tabs">
          <button className={mode === "login" ? "tab active" : "tab"} onClick={() => setMode("login")}>
            Sign in
          </button>
          <button className={mode === "register" ? "tab active" : "tab"} onClick={() => setMode("register")}>
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="form">
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode === "register" && (
            <>
              <label>
                Display name
                <input required maxLength={60} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </label>
              <p className="muted">Other collectors can see this name. Don't use an email address or a link.</p>
            </>
          )}
          <label>
            Password
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="primary" disabled={busy}>
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="demo-users">
          <p className="muted">Or try a seeded demo user (password: {DEMO_PASSWORD}):</p>
          <div className="demo-user-buttons">
            {DEMO_USERS.map((u) => (
              <button key={u.email} className="secondary" disabled={busy} onClick={() => quickSignIn(u.email)}>
                {u.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
