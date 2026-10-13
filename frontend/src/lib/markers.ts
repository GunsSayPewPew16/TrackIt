import type { CSSProperties } from 'react'

/**
 * The tile every transaction badge wears: one warm brown under a white glyph,
 * sampled from the reference the row anatomy came from. Deliberately *not* the
 * category's group colour — a screenful of badges reads as one family instead of
 * a paint chart, which is what the reference's own rows do. The group colours
 * still do their work in the Home breakdown, where telling categories apart is
 * the point.
 */
export const BADGE_COLOR = '#866845'

/** The tone Wallet's plumbing envelopes and unknown categories are marked in. */
export const NEUTRAL_COLOR = '#6b6153'

/**
 * The marker's look: a solid tile, with the glyph in white on top. One fill for
 * every category, so the badge says "a category lives here" and the row's title
 * says which one — and so the tile needs no ink rule per colour. The glyph
 * itself is `CategoryIcon`.
 */
export function markerStyle(): CSSProperties {
  return {
    background: BADGE_COLOR,
    color: '#ffffff',
  }
}
