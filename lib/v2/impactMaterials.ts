export interface ImpactBodyMaterial {
  id: string;
  name: string;
  densityLbmIn3: number;
  sourceLabel: string;
  sourceUrl: string;
  note: string;
}

/** Density presets for mass estimation only; they do not prescribe a flight material. */
export const IMPACT_BODY_MATERIALS: Record<string, ImpactBodyMaterial> = {
  alloySteel4140: {
    id: "alloySteel4140",
    name: "4140 alloy steel",
    densityLbmIn3: 0.284,
    sourceLabel: "ASM/industry reference density",
    sourceUrl: "https://www.azom.com/article.aspx?ArticleID=6769",
    note: "Representative alloy-steel density; heat treatment changes strength much more than density.",
  },
  stainless17_4: {
    id: "stainless17_4",
    name: "17-4 PH stainless steel",
    densityLbmIn3: 0.280,
    sourceLabel: "Carpenter Technology 17Cr-4Ni data sheet",
    sourceUrl: "https://www.carpentertechnology.com/alloy-finder/17cr-4ni",
    note: "Representative precipitation-hardening stainless density.",
  },
  aluminum7075: {
    id: "aluminum7075",
    name: "7075 aluminum",
    densityLbmIn3: 0.101,
    sourceLabel: "Kaiser Aluminum 7075 plate data",
    sourceUrl: "https://online.kaiseraluminum.com/depot/PublicProductInformation/Document/1028/Kaiser_Aluminum_7075_Rod_and_Bar.pdf",
    note: "Representative 7075 density; not a wear/contact recommendation.",
  },
  tungstenHeavyAlloy: {
    id: "tungstenHeavyAlloy",
    name: "Tungsten heavy alloy (nominal 18.0 g/cm³)",
    densityLbmIn3: 0.650,
    sourceLabel: "Midwest Tungsten Service heavy-alloy density range",
    sourceUrl: "https://www.tungsten.com/products/tungsten-alloy/",
    note: "Heavy alloys span roughly 17–18.5 g/cm³; 18.0 g/cm³ is used as a simple estimate.",
  },
};

export function getImpactBodyMaterial(id: string): ImpactBodyMaterial {
  return IMPACT_BODY_MATERIALS[id] ?? IMPACT_BODY_MATERIALS.stainless17_4;
}

export function estimateBodyMassLbm(materialId: string, volumeIn3: number | null): number | null {
  if (volumeIn3 === null || !Number.isFinite(volumeIn3) || volumeIn3 <= 0) return null;
  return getImpactBodyMaterial(materialId).densityLbmIn3 * volumeIn3;
}
