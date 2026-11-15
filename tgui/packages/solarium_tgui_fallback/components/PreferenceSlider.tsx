import { useEffect, useRef, useState } from 'react';

type Props = {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  disabled?: boolean;
  onCommit: (value: number) => void;
};

export function normalizePreferenceNumber(
  value: number,
  min: number,
  max: number,
  step: number,
) {
  const rounded = min + Math.round((value - min) / step) * step;
  return Number(Math.min(max, Math.max(min, rounded)).toFixed(8));
}

export function PreferenceSlider({
  value,
  min,
  max,
  step,
  label,
  disabled,
  onCommit,
}: Props) {
  const normalize = (value: number) =>
    normalizePreferenceNumber(value, min, max, step);
  const [draft, setDraft] = useState(String(normalize(value)));
  const committed = useRef(normalize(value));
  useEffect(() => {
    const next = normalizePreferenceNumber(value, min, max, step);
    committed.current = next;
    setDraft(String(next));
  }, [value, min, max, step]);
  const commit = (text: string) => {
    const number = text.trim() === '' ? NaN : Number(text);
    if (!Number.isFinite(number)) {
      setDraft(String(committed.current));
      return;
    }
    const next = normalize(number);
    setDraft(String(next));
    if (next !== committed.current) {
      committed.current = next;
      onCommit(next);
    }
  };
  return (
    <div className="PreferenceSlider">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={Number(draft) || 0}
        onChange={(event) =>
          setDraft(String(normalize(Number(event.currentTarget.value))))
        }
        onMouseUp={(event) => commit(event.currentTarget.value)}
        onTouchEnd={(event) => commit(event.currentTarget.value)}
        onKeyUp={(event) => commit(event.currentTarget.value)}
        onBlur={(event) => commit(event.currentTarget.value)}
      />
      <input
        type="number"
        aria-label={`${label} value`}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(event.currentTarget.value);
        }}
      />
    </div>
  );
}
