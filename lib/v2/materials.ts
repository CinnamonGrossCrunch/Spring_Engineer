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
    shearModulusPsi: 11_200_000,
    tensileMinPsi: 260_000,
    tensileMaxPsi: 330_000,
    sourceLabel: "Elgiloy Specialty Metals wire data sheet (Rev. 2024-04-02)",
    sourceUrl: "https://www.elgiloy.com/wire-elgiloy-alloy",
    condition: "Spring temper + aged",
    note: "Typical published properties; final strength depends on supplied wire condition and aging.",
  },
  musicWire: {
    id: "musicWire",
    name: "Music Wire",
    specification: "ASTM A228/A228M",
    shearModulusPsi: 11_500_000,
    tensileMinPsi: 256_000,
    tensileMaxPsi: 283_000,
    sourceLabel: "ASTM A228 tensile table at 0.140 in; Suhm Spring Works property reference",
    sourceUrl: "https://suhm.net/wp-content/uploads/2023/10/Suhm_Spring_Works-Spring_Materials_Issue_11_EN_US.pdf",
    condition: "Cold-drawn music-spring-quality wire",
    note: "The 256–283 ksi tensile range is the ASTM value at 0.140 in; strength is diameter-dependent and must be confirmed at the selected size.",
  },
  chromeSilicon: {
    id: "chromeSilicon",
    name: "Chrome Silicon Spring Steel",
    specification: "ASTM A401/A401M",
    shearModulusPsi: 11_500_000,
    tensileMinPsi: 235_000,
    tensileMaxPsi: 300_000,
    sourceLabel: "ASTM A401; Suhm Spring Works property reference",
    sourceUrl: "https://suhm.net/wp-content/uploads/2023/10/Suhm_Spring_Works-Spring_Materials_Issue_11_EN_US.pdf",
    condition: "Cold-drawn and heat-treated spring wire",
    note: "Published 235–300 ksi family range; actual tensile requirement depends on wire diameter and ordered condition.",
  },
};

export const DEFAULT_MATERIAL_ID = "elgiloy";

/** Resolve a material by id, falling back to the default benchmark material. */
export function getV2Material(id: string): V2Material {
  return V2_MATERIALS[id] ?? V2_MATERIALS[DEFAULT_MATERIAL_ID];
}

export function listV2Materials(): V2Material[] {
  return Object.values(V2_MATERIALS);
}
