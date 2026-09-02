/**
 * Vertical HF-latch positions for the three mechanism states. The contact
 * datum comes from the displayed contact length itself—not from L1 + s_h—so
 * the drawing remains coherent while a user is exploring inconsistent inputs.
 */
export function mechanismLatchBottoms(
  contactLength: number,
  releasedLength: number,
  hammerHeight: number,
): [number, number, number] {
  const contactBottom = contactLength + hammerHeight;
  return [contactBottom, contactBottom, releasedLength + hammerHeight];
}

/** Four-state counterpart: armed, contact, critical release, coupled-travel end. */
export function mechanismLatchBottoms4(
  contactLength: number,
  criticalLength: number,
  endLength: number,
  hammerHeight: number,
): [number, number, number, number] {
  const contactBottom = contactLength + hammerHeight;
  return [
    contactBottom,
    contactBottom,
    criticalLength + hammerHeight,
    endLength + hammerHeight,
  ];
}
