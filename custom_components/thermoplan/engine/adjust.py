"""Per-room target adjustments: offset, minimum and maximum."""

from __future__ import annotations


def adjust(
    target: float | None,
    *,
    offset: float = 0.0,
    minimum: float | None = None,
    maximum: float | None = None,
) -> tuple[float | None, list[str]]:
    """Apply an offset, then the limits. Returns the new target and a note per change.

    An off target (None) is never adjusted: limits are about heating, not about switching off.
    """
    if target is None:
        return None, []
    notes: list[str] = []
    value = target
    if offset:
        value += offset
        notes.append(f"{offset:+g} °C adjustment")
    if minimum is not None and value < minimum:
        value = minimum
        notes.append(f"raised to the minimum of {minimum:g} °C")
    if maximum is not None and value > maximum:
        value = maximum
        notes.append(f"limited to the maximum of {maximum:g} °C")
    return round(value, 1), notes
