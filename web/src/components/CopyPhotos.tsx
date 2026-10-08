import { useEffect, useRef, useState } from "react";
import { ApiError, copyImageUrl, deleteCopyPhoto, uploadCopyPhoto, type UserCopy } from "../lib/api";

function PhotoSide({
  copy,
  side,
  label,
  present,
  onChange,
}: {
  copy: UserCopy;
  side: "front" | "back";
  label: string;
  present: boolean;
  onChange?: (event: "saved" | "removed") => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [shown, setShown] = useState(present);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setShown(present);
  }, [present, copy.id]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadCopyPhoto(copy.id, side, file);
      setShown(true);
      setVersion((current) => current + 1);
      onChange?.("saved");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The photo was not saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteCopyPhoto(copy.id, side);
      setShown(false);
      onChange?.("removed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The photo was not removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="copy-photo">
      <p className="copy-photo-label">{label}</p>
      {shown && (
        <img src={copyImageUrl(copy.id, side, version)} alt={`${label} of this copy`} className="copy-photo-img" />
      )}
      <div className="copy-photo-actions">
        <button type="button" className="secondary small" disabled={busy} onClick={() => inputRef.current?.click()}>
          {shown ? "Replace" : "Add"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void onFile(file);
          }}
        />
        {shown && (
          <button type="button" className="link" disabled={busy} onClick={() => void remove()}>
            Remove
          </button>
        )}
      </div>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

export function CopyPhotos({ copy, onChange }: { copy: UserCopy; onChange?: (event: "saved" | "removed") => void }) {
  return (
    <div className="copy-photos">
      <PhotoSide
        copy={copy}
        side="front"
        label="Front photo"
        present={Boolean(copy.has_front_image)}
        onChange={onChange}
      />
      <details>
        <summary>Back photo</summary>
        <PhotoSide
          copy={copy}
          side="back"
          label="Back photo"
          present={Boolean(copy.has_back_image)}
          onChange={onChange}
        />
      </details>
      <p className="muted small">
        Photos stay on your account. A photo is not proof that you own the card, and the front and back are not checked
        to be the same card.
      </p>
    </div>
  );
}
