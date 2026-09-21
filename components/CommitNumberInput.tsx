"use client";

import { useState, type InputHTMLAttributes } from "react";

type BaseNumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange"
>;

type CommitNumberInputProps = BaseNumberInputProps & {
  value: number;
  onCommit: (value: number) => void;
};

type OptionalCommitNumberInputProps = BaseNumberInputProps & {
  value: number | null;
  onCommit: (value: number | null) => void;
};

function numberText(value: number | null): string {
  return value !== null && Number.isFinite(value) ? String(value) : "";
}

/**
 * A numeric field that permits incomplete typing states without changing the
 * application model. A valid number is committed on Enter or focus-out;
 * empty and invalid drafts revert to the last committed value.
 */
function BufferedNumberInput({
  value,
  onCommit,
  allowEmpty,
  onFocus,
  onBlur,
  onKeyDown,
  ...inputProps
}: BaseNumberInputProps & {
  value: number | null;
  onCommit: (value: number | null) => void;
  allowEmpty: boolean;
}) {
  const committedText = numberText(value);
  const [draft, setDraft] = useState(committedText);
  const [isEditing, setIsEditing] = useState(false);

  const finishEditing = () => {
    if (draft.trim() === "") {
      if (allowEmpty) onCommit(null);
      setIsEditing(false);
      return;
    }
    const next = Number(draft);
    if (Number.isFinite(next)) onCommit(next);
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

export function CommitNumberInput({ onCommit, ...props }: CommitNumberInputProps) {
  return (
    <BufferedNumberInput
      {...props}
      allowEmpty={false}
      onCommit={(next) => {
        if (next !== null) onCommit(next);
      }}
    />
  );
}

export function OptionalCommitNumberInput(props: OptionalCommitNumberInputProps) {
  return <BufferedNumberInput {...props} allowEmpty />;
}
