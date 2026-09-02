"use client";

import type { ConstraintResult } from "@/lib/engineering/types";
import type { PresetId } from "@/data/exampleModel";
import { ForceTravelChart } from "../ForceTravelChart";
import { OverviewMechanism } from "./OverviewMechanism";
import { OverviewConceptCards } from "./OverviewConceptCards";

/**
 * Overview presentation: distilled, plain-language view of the mechanism.
 * Consumes the SAME shared solver output as the Engineering view — it never
 * recomputes engineering values. Composition only:
 *   1. mechanism-state illustration
 *   2. simplified spring-force-through-travel graph
 *   3. four high-level concept cards
 */
export function Overview({
  values,
  selectedId,
  constraints,
  onSelect,
  presetId,
}: {
  values: Record<string, number | undefined>;
  selectedId: string | null;
  constraints: ConstraintResult[];
  onSelect: (id: string) => void;
  presetId: PresetId;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3">
      <OverviewMechanism
        values={values}
        selectedId={selectedId}
        constraints={constraints}
        onSelect={onSelect}
        presetId={presetId}
      />

      <ForceTravelChart
        F1={values.F1}
        F2={values.F2}
        F3={values.F3}
        F4={values.F4}
        s_h={values.s_h}
        y_latch={values.y_latch}
        y_total={values.y_total}
        F_end_min={values.F_end_min}
        F_opposing={values.F_opposing}
        F_latch_avg={values.F_latch_avg}
        onSelect={onSelect}
        simplified
      />

      <OverviewConceptCards
        values={values}
        constraints={constraints}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </div>
  );
}
