import { Bus, Coffee, House, Laptop, ShoppingCart, Utensils, Wallet, type LucideIcon } from "lucide-react"

import { CategoryIcon } from "@/lib/category-icons"

/**
 * The glyph on a ledger card's tile, and on the dashboard's top-category card.
 *
 * The design gives each of its own rows a face — a coffee cup, a bus, a cart, a
 * laptop, a house, a wallet — and those are Lucide icons, so they come from
 * `lucide-react` here, all of them at the line weight the design uses. An imported
 * row has no such face: it wears **its category's marker**, which is the table in
 * `lib/category-icons.tsx` (the same Lucide line art, keyed by category id and
 * owned by `tools/lucide-icons.py`).
 *
 * Both arrive as one string, which is why this component exists: `name` is looked
 * up among the faces below, and anything else is treated as a category id. A
 * category could never collide with a face name — the one thing that makes that
 * safe is that none of these names is also a category id, so adding a face here
 * means checking `lib/categories.ts` first.
 */
const FACES: Record<string, LucideIcon> = {
  bus: Bus,
  cart: ShoppingCart,
  coffee: Coffee,
  home: House,
  laptop: Laptop,
  utensils: Utensils,
  wallet: Wallet,
}

export function RowIcon({ name, className }: { name: string; className?: string }) {
  const Face = FACES[name]
  if (Face) return <Face className={className} strokeWidth={1.5} aria-hidden="true" />
  return <CategoryIcon id={name} className={className} />
}
