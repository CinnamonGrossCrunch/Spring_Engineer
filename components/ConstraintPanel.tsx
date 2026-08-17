"use client";

import type { Conflict, ConstraintResult } from "@/lib/engineering/types";

/**
 * Aggregated overconstraint conflicts (solver) and physical constraint
 * checks (stress, coil bind, continuous drive…).
 */
export function ConstraintPanel({
  conflicts,
  constraints,
  unresolved,
  onSelect,
}: {
  conflicts: Conflict[];
  constraints: ConstraintResult[];
  unresolved: string[];
  onSelect: (id: string) => void;
}) {
  const violations = constraints.filter((c) => !c.ok);
  const passing = constraints.filter((c) => c.ok);

  const groups = [
    {
      title: "Spring geometry",
      items: passing.filter((c) => ["coil_bind", "spring_index", "deflection_positive"].includes(c.id)),
    },
    {
      title: "Stress and force margin",
      items: passing.filter((c) => ["stress", "continuous_drive", "contact_force"].includes(c.id)),
    },
    {
      title: "Other consistency checks",
      items: passing.filter(
        (c) => !["coil_bind", "spring_index", "deflection_positive", "stress", "continuous_drive", "contact_force"].includes(c.id),
      ),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
      <h2 className="font-semibold text-zinc-800">Constraints & Consistency</h2>

      {conflicts.length === 0 && violations.length === 0 && unresolved.length === 0 && (
        <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[12px] text-emerald-700">
          Spring model: {passing.length}/{passing.length} checks passing. Dynamic impact model:
          unresolved by V1.
        </p>
      )}

      {conflicts.map((c) => (
        <div
          key={c.equationId}
          className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-[12px] text-red-700"
        >
          <span className="font-semibold">Overconstrained.</span> {c.message}
        </div>
      ))}

      {violations.length > 0 && (
        <div className="mt-3 space-y-2">
          {violations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => c.parameterIds[0] && onSelect(c.parameterIds[0])}
              className={`block w-full rounded border px-2 py-1.5 text-left text-[12px] ${
                c.severity === "error"
                  ? "border-red-300 bg-red-50 text-red-700"
                  : "border-amber-300 bg-amber-50 text-amber-800"
              }`}
            >
              <span className="font-semibold">{c.name}: </span>
              {c.message}
            </button>
          ))}
        </div>
      )}

      {groups.length > 0 && (
        <div className="mt-3 space-y-2">
          {groups.map((group) => (
            <div key={group.title} className="rounded border border-zinc-200 bg-zinc-50 p-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                {group.title}
              </div>
              <ul className="space-y-1">
                {group.items.map((c) => (
                  <li key={c.id} className="text-[12px] text-zinc-600">
                    <span className="font-medium text-emerald-700">✓ {c.name}: </span>
                    {c.message}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {unresolved.length > 0 && (
        <div className="mt-2 rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[12px] text-zinc-600">
          <span className="font-semibold">Unresolved: </span>
          the engine cannot currently derive{" "}
          {unresolved.map((id, i) => (
            <span key={id}>
              {i > 0 && ", "}
              <button type="button" className="font-mono underline" onClick={() => onSelect(id)}>
                {id}
              </button>
            </span>
          ))}
          . Pin or provide more upstream values.
        </div>
      )}
    </div>
  );
}
