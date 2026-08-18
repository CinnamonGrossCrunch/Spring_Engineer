import type { V2Material } from "./types";

/**
 * V2 benchmark material models.
 *
 * These are VENDOR-PUBLISHED properties used as a benchmark for the first
 * optimization pass — NOT a certified aerospace material approval. The broad
 * tensile range is a published property window, not an exact certification for
 * the eventual wire diameter / heat-treatment condition.
 *
 * The structure is deliberately open so future options (17-7 PH, Inconel
 * X-750, chrome silicon, …) can be added later. Elgiloy alone is enough for the
 * V2 initial optimization.
 */
export const V2_MATERIALS: Record<string, V2Material> = {
  elgiloy: {
    id: "elgiloy",
    name: "Elgiloy",
    specification: "AMS 5833",
    shearModulusPsi: 12_000_000, // G = 12.0 Mpsi
    tensileMinPsi: 270_000, // conservative end of Lee's published range
    tensileMaxPsi: 300_000, // optimistic end of Lee's published range
    sourceLabel: "Lee Spring published material properties",
  },
};

export const DEFAULT_MATERIAL_ID = "elgiloy";

/** Resolve a material by id, falling back to the default benchmark material. */
export function getV2Material(id: string): V2Material {
  return V2_MATERIALS[id] ?? V2_MATERIALS[DEFAULT_MATERIAL_ID];
}

/** Tensile strength [psi] used to classify the stress band for a given basis. */
export function tensileBasisPsi(
  material: V2Material,
  basis: "conservative" | "mid" | "upper",
): number {
  switch (basis) {
    case "upper":
      return material.tensileMaxPsi;
    case "mid":
      return (material.tensileMinPsi + material.tensileMaxPsi) / 2;
    case "conservative":
    default:
      return material.tensileMinPsi;
  }
}
