"use client";

import { useState, type InputHTMLAttributes } from "react";

type CommitNumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  value: number;
  onCommit: (value: number) => void;
};

function numberText(value: number): string {
  return Number.isFinite(value) ? String(value) : "";
}

/**
 * A numeric field that permits incomplete typing states without changing the
 * application model. A valid number is committed on Enter or focus-out;
 * empty and invalid drafts revert to the last committed value.
 */
export function CommitNumberInput({
  value,
  onCommit,
  onFocus,
  onBlur,
  onKeyDown,
  ...inputProps
}: CommitNumberInputProps) {
  const committedText = numberText(value);
  const [draft, setDraft] = useState(committedText);
  const [isEditing, setIsEditing] = useState(false);

  const finishEditing = () => {
    const next = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(next)) onCommit(next);
    setIsEditing(false);
  };

  return (
    <input
      {...inputProps}
      type="number"
      value={isEditing ? draft : committedText}
      onFocus={(event) => {
        setDraft(committedText);
        setIsEditing(true);
        onFocus?.(event);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        finishEditing();
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        onKeyDown?.(event);
      }}
    />
  );
}
