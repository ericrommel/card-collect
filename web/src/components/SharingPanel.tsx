import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { ShareSettings, ShareVisibility } from "../lib/api";

const VISIBILITY_FIELDS: { key: keyof ShareVisibility; label: string }[] = [
  { key: "completion", label: "Completion %" },
  { key: "owned", label: "Owned cards" },
  { key: "missing", label: "Missing cards" },
  { key: "duplicates", label: "Duplicates" },
  { key: "trade", label: "Cards for trade" },
  { key: "give_away", label: "Cards to give away" },
];

export function SharingPanel({ setId }: { setId: string }) {
  const [settings, setSettings] = useState<ShareSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getShareSettings(setId);
      setSettings(res.share);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sharing settings");
    } finally {
      setLoading(false);
    }
  }, [setId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleEnable() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.updateShareSettings(setId, { enabled: true });
      setSettings(res.share);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable sharing");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.updateShareSettings(setId, { enabled: false });
      setSettings(res.share);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable sharing");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate() {
    if (!window.confirm("Regenerate the public link? The current link will stop working immediately.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.regenerateShare(setId);
      setSettings(res.share);
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate link");
    } finally {
      setBusy(false);
    }
  }

  async function handleVisibilityToggle(key: keyof ShareVisibility, value: boolean) {
    if (!settings) return;
    const previous = settings;
    // Optimistic update: this is a controlled checkbox, so without it React
    // would snap the box back to the old value on the next render (which
    // happens before the API call resolves) and the click would appear to
    // do nothing.
    setSettings({ ...settings, visibility: { ...settings.visibility, [key]: value } });
    setBusy(true);
    setError(null);
    try {
      const res = await api.updateShareSettings(setId, { visibility: { [key]: value } });
      setSettings(res.share);
    } catch (err) {
      setSettings(previous);
      setError(err instanceof Error ? err.message : "Failed to update visibility");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy the link — copy it manually instead.");
    }
  }

  if (loading) return null;

  const publicUrl = settings ? `${window.location.origin}/c/${settings.share_id}` : "";

  return (
    <div className="card sharing-panel">
      <div className="sharing-header">
        <h3>Sharing</h3>
        {settings?.enabled ? (
          <button className="secondary small" disabled={busy} onClick={handleDisable}>
            Disable sharing
          </button>
        ) : (
          <button className="primary small" disabled={busy} onClick={handleEnable}>
            Enable sharing
          </button>
        )}
      </div>

      {error && <p className="error small">{error}</p>}

      {!settings?.enabled && <p className="muted small">This collection is private. Nobody can see it but you.</p>}

      {settings?.enabled && (
        <>
          <div className="share-link-row">
            <input type="text" readOnly value={publicUrl} onFocus={(e) => e.target.select()} />
            <button className="secondary small" onClick={() => handleCopyLink(publicUrl)}>
              {copied ? "Copied!" : "Copy link"}
            </button>
            <a className="secondary small" href={`/c/${settings.share_id}`} target="_blank" rel="noreferrer">
              Open
            </a>
            <button className="link-danger" disabled={busy} onClick={handleRegenerate}>
              Regenerate
            </button>
          </div>

          <p className="muted small">Visible to anyone with the link:</p>
          <div className="visibility-grid">
            {VISIBILITY_FIELDS.map(({ key, label }) => (
              <label key={key} className="visibility-option">
                <input
                  type="checkbox"
                  checked={settings.visibility[key]}
                  disabled={busy}
                  onChange={(e) => handleVisibilityToggle(key, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
