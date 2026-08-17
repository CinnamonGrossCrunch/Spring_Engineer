export type EngineeringLane =
  | "spring-design"
  | "spring-behavior"
  | "hammer-dynamics"
  | "latch-requirement";

export type LogicGroupId =
  | "geometry"
  | "rate"
  | "installation"
  | "drive"
  | "hammer"
  | "impact"
  | "latch"
  | "stress-constraint"
  | "solid-constraint";

export interface CanonicalNodePosition {
  lane: EngineeringLane;
  row: 0 | 1 | 2;
}

export interface LaneSpec {
  id: EngineeringLane;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const LOGIC_NODE_WIDTH = 215;

const LANE_WIDTH = 240;
const LANE_GAP = 14;
const LANE_TOP = 50;
const LANE_HEIGHT = 710;

// Per-lane row baselines avoid overlap when node heights differ by domain.
const LANE_ROW_Y: Record<EngineeringLane, Record<0 | 1 | 2, number>> = {
  // Explicit vertical buffers per lane to avoid overlap across variable node heights.
  "spring-design": { 0: 84, 1: 345, 2: 545 },
  "spring-behavior": { 0: 84, 1: 325, 2: 545 },
  "hammer-dynamics": { 0: 84, 1: 355, 2: 540 },
  "latch-requirement": { 0: 120, 1: 335, 2: 540 },
};

const LANE_ORDER: EngineeringLane[] = [
  "spring-design",
  "spring-behavior",
  "hammer-dynamics",
  "latch-requirement",
];

const LANE_LABELS: Record<EngineeringLane, string> = {
  "spring-design": "SPRING DESIGN",
  "spring-behavior": "SPRING BEHAVIOR",
  "hammer-dynamics": "HAMMER DYNAMICS",
  "latch-requirement": "LATCH REQUIREMENT",
};

export const CANONICAL_NODE_LAYOUT: Record<LogicGroupId, CanonicalNodePosition> = {
  geometry: { lane: "spring-design", row: 0 },
  "stress-constraint": { lane: "spring-design", row: 1 },
  "solid-constraint": { lane: "spring-design", row: 2 },

  rate: { lane: "spring-behavior", row: 0 },
  installation: { lane: "spring-behavior", row: 1 },

  drive: { lane: "hammer-dynamics", row: 0 },
  hammer: { lane: "hammer-dynamics", row: 1 },
  impact: { lane: "hammer-dynamics", row: 2 },

  latch: { lane: "latch-requirement", row: 1 },
};

export function getLaneSpecs(): LaneSpec[] {
  return LANE_ORDER.map((lane, idx) => {
    const x = idx * (LANE_WIDTH + LANE_GAP);
    return {
      id: lane,
      title: LANE_LABELS[lane],
      x,
      y: LANE_TOP,
      width: LANE_WIDTH,
      height: LANE_HEIGHT,
    };
  });
}

export function getLaneRowY(lane: EngineeringLane, row: 0 | 1 | 2): number {
  return LANE_ROW_Y[lane][row];
}

export function getCanonicalGroupPosition(id: LogicGroupId): { x: number; y: number } {
  const canonical = CANONICAL_NODE_LAYOUT[id];
  const laneSpec = getLaneSpecs().find((s) => s.id === canonical.lane)!;
  return {
    x: laneSpec.x + (laneSpec.width - LOGIC_NODE_WIDTH) / 2,
    y: getLaneRowY(canonical.lane, canonical.row),
  };
}

export function getCanonicalPositions(): Record<LogicGroupId, { x: number; y: number }> {
  return {
    geometry: getCanonicalGroupPosition("geometry"),
    rate: getCanonicalGroupPosition("rate"),
    installation: getCanonicalGroupPosition("installation"),
    drive: getCanonicalGroupPosition("drive"),
    hammer: getCanonicalGroupPosition("hammer"),
    impact: getCanonicalGroupPosition("impact"),
    latch: getCanonicalGroupPosition("latch"),
    "stress-constraint": getCanonicalGroupPosition("stress-constraint"),
    "solid-constraint": getCanonicalGroupPosition("solid-constraint"),
  };
}

export function getGraphExtent() {
  const lanes = getLaneSpecs();
  const last = lanes[lanes.length - 1];
  return {
    width: last.x + last.width,
    height: LANE_TOP + LANE_HEIGHT,
  };
}
