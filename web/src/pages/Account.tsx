import { useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import { useAuth } from "../state/AuthContext";

export function AccountPage() {
  const { user, changePassword, updateDisplayName } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameStatus, setNameStatus] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"name" | "password" | null>(null);

  useEffect(() => {
    setDisplayName(user?.display_name ?? "");
  }, [user?.display_name]);

  if (!user) return null;

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    setNameError(null);
    setNameStatus(null);
    const next = displayName.trim();
    if (!next) {
      setNameError("Enter a display name.");
      return;
    }
    setBusy("name");
    try {
      await updateDisplayName(next);
      setNameStatus("Name saved. Other collectors will see this name.");
    } catch (err) {
      setNameError(err instanceof ApiError ? err.message : "Could not save that name.");
    } finally {
      setBusy(null);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordStatus(null);
    if (newPassword.length < 8) {
      setPasswordError("Use at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Those new passwords don't match.");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError("Choose a different password.");
      return;
    }
    setBusy("password");
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus("Password updated. Other browsers are signed out.");
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Could not change the password.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page-stack">
      <div>
        <p className="eyebrow">Account</p>
        <h1>Your account</h1>
        <p className="muted">
          Signed in as <strong>{user.email}</strong>. Email can't be changed here. Other collectors see your display
          name, not this email.
        </p>
      </div>

      <section className="card account-panel">
        <h2>Display name</h2>
        <form onSubmit={saveName} className="form">
          <label>
            Name other collectors see
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={60}
              autoComplete="nickname"
              required
            />
          </label>
          <p className="muted">This name can appear on a shared page. Don't use an email address or a link.</p>
          {nameError && (
            <p className="error" role="alert">
              {nameError}
            </p>
          )}
          {nameStatus && (
            <p className="muted" role="status">
              {nameStatus}
            </p>
          )}
          <button type="submit" className="primary" disabled={busy !== null}>
            Save name
          </button>
        </form>
      </section>

      <section className="card account-panel">
        <h2>Password</h2>
        <p className="muted">
          Changing your password keeps you signed in here and signs out every other browser. Sign out ends every
          session, including this one. There is no email to reset a forgotten password.
        </p>
        <form onSubmit={savePassword} className="form">
          <label>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          {passwordError && (
            <p className="error" role="alert">
              {passwordError}
            </p>
          )}
          {passwordStatus && (
            <p className="muted" role="status">
              {passwordStatus}
            </p>
          )}
          <button type="submit" className="primary" disabled={busy !== null}>
            Change password
          </button>
        </form>
      </section>
    </div>
  );
}
