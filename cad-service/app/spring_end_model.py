"""
CAD end model: squared (closed) and ground, version 1.

Everything about how the end turns are shaped lives here so that vendor
guidance can replace it without touching the sweep/export code.

-------------------------------------------------------------------------
WHAT IS AN ENGINEERING REQUIREMENT vs A CAD REPRESENTATION HEURISTIC
-------------------------------------------------------------------------
Engineering requirements (exact, taken from the V2 candidate):
    d, D, OD, ID, Na, Nt, and the requested state length L.

CAD representation heuristics (this file, replaceable):
    how the inactive end turn is split between a closed bearing region and a
    tangent transition, and how much wire the grind removes.

-------------------------------------------------------------------------
ON "ZERO PITCH"
-------------------------------------------------------------------------
A squared end is often described as having "zero pitch". Taken literally that
is self-intersecting geometry: a helical wire of diameter d interpenetrates
itself unless the axial rise across one full turn is at least d.

Write the one-turn rise as  delta(t) = z(t+1) - z(t).  Non-interpenetration is
delta(t) >= d for every t. If the terminal 0.75 turn had literally zero pitch
and the following 0.25 turn ramped to the active pitch p_a via a smoothstep
(mean value 1/2), then

    delta(0) = 0.25 * p_a * 0.5 = 0.125 * p_a

which needs p_a >= 8*d. Real springs in this design region run p_a/d ~ 5, so
literal zero pitch would drive the terminal coil straight through its
neighbour.

So "zero pitch" is implemented here as *zero coil gap*: the closed-end pitch
floor is d (plus a tiny kernel clearance), which is the physically correct
"coils touching" condition. This is the standard meaning of a closed end and
it makes the model provably non-interpenetrating; see min_one_turn_rise().
"""

from __future__ import annotations

from dataclasses import dataclass, asdict

from .tolerances import CAD_TANGENCY_CLEARANCE_MM

CAD_GENERATOR_VERSION = "spring-cad-0.1"
END_MODEL_VERSION = "squared-ground-v1"


@dataclass(frozen=True)
class EndModelV1:
    """
    Nominal squared-and-ground end form.

    end_turns_per_side must equal closed_turns + transition_turns; the pair is
    kept explicit because vendors describe them separately.
    """

    end_turns_per_side: float = 1.0
    closed_turns: float = 0.75
    transition_turns: float = 0.25
    grind_depth_fraction: float = 0.5

    def __post_init__(self) -> None:
        total = self.closed_turns + self.transition_turns
        if abs(total - self.end_turns_per_side) > 1e-9:
            raise ValueError(
                f"closed_turns + transition_turns ({total}) must equal "
                f"end_turns_per_side ({self.end_turns_per_side})"
            )
        if self.transition_turns <= 0:
            raise ValueError("transition_turns must be > 0 for a tangent transition")
        if not 0.0 <= self.grind_depth_fraction < 1.0:
            raise ValueError("grind_depth_fraction must be in [0, 1)")

    def as_metadata(self) -> dict:
        data = asdict(self)
        data["note"] = (
            "CAD representation heuristic - vendor confirmation required. "
            "grind_depth_fraction = 0.5 is chosen so the model reproduces the "
            "textbook squared-and-ground solid height Hs = Nt*d exactly."
        )
        return data


CAD_END_MODEL_V1 = EndModelV1()


def smoothstep(x: float) -> float:
    """
    Cubic smoothstep 3x^2 - 2x^3, with f(0)=0, f(1)=1 and zero derivative at
    both ends. The vanishing endpoint derivatives are what make the pitch
    profile, and therefore the centerline tangent, continuous across the
    transition.
    """
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    return x * x * (3.0 - 2.0 * x)


def smoothstep_integral(x: float) -> float:
    """
    Integral of smoothstep from 0 to x, for x in [0, 1]: x^3 - x^4/2.
    Used to integrate the pitch profile in closed form rather than numerically.
    """
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 0.5
    return x**3 - 0.5 * x**4


def closed_pitch_mm(d_mm: float) -> float:
    """Axial rise per turn in the closed end region: coils touching."""
    return d_mm + CAD_TANGENCY_CLEARANCE_MM


class SpringPitchProfile:
    """
    Axial rise per turn as a function of turn coordinate t in [0, Nt].

    Profile, measured from whichever end is nearer:
        [0, closed_turns)                  -> p_closed        (coils touching)
        [closed_turns, end_turns_per_side) -> smoothstep ramp (tangent-continuous)
        [end_turns_per_side, Nt - end...)  -> p_active
    mirrored at the top, so the part is symmetric end to end.
    """

    def __init__(self, total_turns: float, d_mm: float, active_pitch_mm: float,
                 end_model: EndModelV1 = CAD_END_MODEL_V1):
        if total_turns < 2.0 * end_model.end_turns_per_side:
            raise ValueError(
                f"total_turns ({total_turns}) must be at least twice "
                f"end_turns_per_side ({end_model.end_turns_per_side})"
            )
        self.Nt = float(total_turns)
        self.d = float(d_mm)
        self.p_active = float(active_pitch_mm)
        self.p_closed = closed_pitch_mm(d_mm)
        self.cfg = end_model

    # ------------------------------------------------------------------
    def pitch_at(self, t: float) -> float:
        """Local axial rise per turn at turn coordinate t."""
        c = self.cfg.closed_turns
        e = self.cfg.end_turns_per_side
        tr = self.cfg.transition_turns
        u = min(t, self.Nt - t)  # turns from the nearer end
        if u <= c:
            return self.p_closed
        if u >= e:
            return self.p_active
        return self.p_closed + (self.p_active - self.p_closed) * smoothstep((u - c) / tr)

    # ------------------------------------------------------------------
    def _end_rise(self) -> float:
        """Axial rise accumulated over one complete end turn."""
        e = self.cfg.end_turns_per_side
        tr = self.cfg.transition_turns
        dp = self.p_active - self.p_closed
        return self.p_closed * e + dp * tr * 0.5

    def _rise_from_bottom(self, t: float) -> float:
        """Closed-form integral of pitch over [0, t], valid for t <= Nt/2."""
        c = self.cfg.closed_turns
        e = self.cfg.end_turns_per_side
        tr = self.cfg.transition_turns
        dp = self.p_active - self.p_closed
        if t <= c:
            return self.p_closed * t
        if t <= e:
            x = (t - c) / tr
            return self.p_closed * t + dp * tr * smoothstep_integral(x)
        return self._end_rise() + self.p_active * (t - e)

    def rise_at(self, t: float) -> float:
        """Centerline height z(t), with z(0) = 0. Symmetric about Nt/2."""
        half = self.Nt / 2.0
        if t <= half:
            return self._rise_from_bottom(t)
        return self.centerline_rise() - self._rise_from_bottom(self.Nt - t)

    def centerline_rise(self) -> float:
        """Total centerline rise z(Nt) - z(0)."""
        e = self.cfg.end_turns_per_side
        return 2.0 * self._end_rise() + self.p_active * (self.Nt - 2.0 * e)

    # ------------------------------------------------------------------
    def min_one_turn_rise(self, samples: int = 2000) -> float:
        """
        Smallest axial separation between a point on the wire and the same
        angular point one turn later. Must be >= d or the wire interpenetrates.

        For this profile the minimum sits in the closed region and equals
        p_closed whenever p_active >= p_closed, so a valid state is always
        non-interpenetrating. We measure it rather than assert it.
        """
        if self.Nt <= 1.0:
            return float("inf")
        worst = float("inf")
        for i in range(samples + 1):
            t = (self.Nt - 1.0) * i / samples
            worst = min(worst, self.rise_at(t + 1.0) - self.rise_at(t))
        return worst


# ---------------------------------------------------------------------------
# Length solve
# ---------------------------------------------------------------------------

def solve_active_pitch_mm(target_length_mm: float, total_turns: float, d_mm: float,
                          end_model: EndModelV1 = CAD_END_MODEL_V1) -> float:
    """
    Active pitch that makes the *ground* overall height equal target_length_mm.

    Derivation. With centerline rise H_c the swept solid spans [-r, H_c + r],
    i.e. it is H_c + d tall. Grinding removes g = gdf*d from each end, so the
    finished height is

        L = H_c + d - 2*gdf*d

    Expanding H_c = 2*end_rise + p_a*(Nt - 2e) with
    end_rise = p_c*e + (p_a - p_c)*tr/2 gives

        L = 2*p_c*e + (p_a - p_c)*tr + p_a*(Nt - 2e) + d*(1 - 2*gdf)

    which is linear in p_a and inverts directly. No iteration is needed. The
    result is exact for the analytic centerline; the small spline
    approximation error is absorbed afterwards by measuring the built solid
    and placing the grind planes from its real extent (see spring_geometry).

    Sanity check: at the closed limit p_a -> d with the default heuristics
    (e=1, tr=0.25, gdf=0.5) this reduces to L = (Na + 2)*d = Nt*d, the textbook
    squared-and-ground solid height. So "p_a >= d" and "L >= Nt*d" are the same
    condition, and geometric validity coincides with the engineering model the
    app already uses.
    """
    e = end_model.end_turns_per_side
    tr = end_model.transition_turns
    gdf = end_model.grind_depth_fraction
    p_c = closed_pitch_mm(d_mm)

    denom = tr + total_turns - 2.0 * e
    if denom <= 0:
        raise ValueError("Degenerate coil count: no active region to distribute pitch over")

    numer = target_length_mm - 2.0 * p_c * e + p_c * tr - d_mm * (1.0 - 2.0 * gdf)
    return numer / denom


def minimum_buildable_length_mm(total_turns: float, d_mm: float,
                                end_model: EndModelV1 = CAD_END_MODEL_V1) -> float:
    """
    Shortest state length that does not require p_active < p_closed, i.e. the
    nominal solid height for this end model. With the default heuristics this
    equals Nt*d to within the tangency clearance.
    """
    e = end_model.end_turns_per_side
    gdf = end_model.grind_depth_fraction
    p_c = closed_pitch_mm(d_mm)
    return 2.0 * p_c * e + p_c * (total_turns - 2.0 * e) + d_mm * (1.0 - 2.0 * gdf)
