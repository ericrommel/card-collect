import { useEffect, useRef, useState } from "react";

/** Optional back photo for a card being added. Not sent for identification. */
export function OptionalBackPhoto({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <>
      {preview && (
        <figure className="add-photo-figure">
          <img src={preview} alt="Back of the card you selected" className="add-preview" />
          <figcaption className="muted small">Back</figcaption>
        </figure>
      )}
      <div className="back-photo">
        <p className="muted small">
          A back photo is optional. The two photos are not checked to be the same card, and they do not prove that you
          hold it.
        </p>
        <div className="photo-actions">
          <button type="button" className="secondary" onClick={() => inputRef.current?.click()}>
            {file ? "Replace the back" : "Add the back"}
          </button>
          {file && (
            <button type="button" className="secondary" onClick={() => onChange(null)}>
              Remove the back
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png"
            capture="environment"
            hidden
            onChange={(event) => {
              const next = event.target.files?.[0];
              event.target.value = "";
              if (next) onChange(next);
            }}
          />
        </div>
      </div>
    </>
  );
}
