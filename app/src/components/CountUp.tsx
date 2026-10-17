import { animate, motion, useMotionValue, useTransform } from "framer-motion"
import { useEffect } from "react"

/**
 * A money figure that counts up to its value: from zero on first paint, and to the new
 * value on every change. It is the gauge's count, so every figure on the screen moves the
 * same way, over the same 0.6s ease-out.
 */
export function CountUp({
  cents,
  format,
  className,
}: {
  /** Integer paise. */
  cents: number
  /** How a whole number of paise is written, e.g. `money` or `wholeMoney`. */
  format: (cents: number) => string
  className?: string
}) {
  const count = useMotionValue(0)
  const label = useTransform(count, (value) => format(Math.round(value)))
  useEffect(() => {
    const controls = animate(count, cents, { duration: 0.6, ease: "easeOut" })
    return () => controls.stop()
  }, [cents, count])
  return <motion.span className={className}>{label}</motion.span>
}
