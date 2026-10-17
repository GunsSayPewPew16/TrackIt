import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  animate,
  motion,
  MotionConfig,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import {
  ArrowLeft,
  Bus,
  Check,
  ChevronDown,
  Coffee,
  Home,
  Laptop,
  Moon,
  Plus,
  ShoppingCart,
  Sun,
  Wallet,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Design tokens — Sage & Sandstone                                           */
/* -------------------------------------------------------------------------- */

const THEMES = {
  dark: {
    "--bg": "#0A0F0D",
    "--card": "#1A221E",
    "--line": "#28332E",
    "--ink": "#F4F0EA",
    "--ink2": "#F4F0EA99",
    "--clay": "#D4A373",
    "--sage": "#A3B19B",
    "--on-clay": "#0A0F0D",
    "--on-sage": "#0A0F0D",
    // date capsules
    "--pill": "#1A221E", // Muted Smoked Moss
    "--pill-ink": "#F4F0EA99", // Desert Cream @ 60%
    "--pill-on": "#A3B19B", // Pale Sage
    "--pill-on-ink": "#1A221E", // Obsidian Moss Ink
  },
  light: {
    "--bg": "#F8F6F2",
    "--card": "#FFFFFF",
    "--line": "#E2DDD5",
    "--ink": "#1A221E",
    "--ink2": "#1A221E99",
    "--clay": "#C58B54",
    "--sage": "#6B7F64",
    "--on-clay": "#1A221E",
    "--on-sage": "#FFFFFF",
    // date capsules
    "--pill": "#F8F6F2", // Linen Cream
    "--pill-ink": "#1A221E99", // Obsidian Moss Ink @ 60%
    "--pill-on": "#6B7F64", // Deep Forest Sage
    "--pill-on-ink": "#FFFFFF",
  },
};

// Neue Haas Grotesk, with Tailwind's `font-sans` stack as the fallback. No serifs.
const FALLBACK = '"Helvetica Neue",Helvetica,Arial,ui-sans-serif,system-ui,sans-serif';
const GROTESK = `"Neue Haas Grotesk Text Pro","Neue Haas Grotesk Display Pro",${FALLBACK}`;
const GROTESK_DISPLAY = `"Neue Haas Grotesk Display Pro","Neue Haas Grotesk Text Pro",${FALLBACK}`;

/* -------------------------------------------------------------------------- */
/*  Arc geometry                                                               */
/* -------------------------------------------------------------------------- */

const R = 800; // arc radius, px
const STEP = 0.0863; // radians between neighbouring capsules
const PITCH = R * STEP; // ≈ 69px of drag = one capsule
const VISIBLE = 3; // capsules further than this from focus are inert

// Value at |offset| = 0, 1, 2, 3, 4 (linearly interpolated, flat beyond the end)
const SCALE_CURVE = [1.15, 1, 0.9, 0.78, 0.7];
const OPACITY_CURVE = [1, 1, 0.8, 0.4, 0];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function sample(a, curve) {
  if (a >= curve.length - 1) return curve[curve.length - 1];
  const i = Math.floor(a);
  return curve[i] + (curve[i + 1] - curve[i]) * (a - i);
}

/** `o` = signed distance (in capsules) from the focal axis. */
function arcTransform(o) {
  const th = o * STEP;
  const px = R * Math.sin(th);
  const py = R * (1 - Math.cos(th));
  const deg = (th * 180) / Math.PI;
  const sc = sample(Math.abs(o), SCALE_CURVE);
  return `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) rotateY(${(-o * 9).toFixed(1)}deg) rotate(${deg.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
}

/** Framer `modifyTarget`: lock the inertia end-point onto the nearest capsule centre. */
export function snapToCapsule(target, lastIndex) {
  return -clamp(Math.round(-target / PITCH), 0, lastIndex) * PITCH;
}

/* -------------------------------------------------------------------------- */
/*  Dynamic date array                                                         */
/* -------------------------------------------------------------------------- */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthLong = new Intl.DateTimeFormat("en-US", { month: "long" });
const monthYear = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

/**
 * Days 1..31 for the month. The ongoing month stops at today; past months run to
 * their last day; future months are empty.
 */
export function buildMonthDates(year, month, today = new Date()) {
  const monthIdx = year * 12 + month;
  const todayIdx = today.getFullYear() * 12 + today.getMonth();
  if (monthIdx > todayIdx) return [];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const last = monthIdx === todayIdx ? Math.min(today.getDate(), daysInMonth) : daysInMonth;
  const name = monthLong.format(new Date(year, month, 1));

  return Array.from({ length: last }, (_, i) => {
    const day = i + 1;
    const weekday = WEEKDAYS[new Date(year, month, day).getDay()];
    return { day, weekday, label: `${weekday} ${day} ${name}` };
  });
}

export function useMonthDates(year, month, today = new Date()) {
  const ty = today.getFullYear();
  const tm = today.getMonth();
  const td = today.getDate();
  return useMemo(() => buildMonthDates(year, month, new Date(ty, tm, td)), [year, month, ty, tm, td]);
}

function recentMonths(today, count = 12) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    return { year: d.getFullYear(), month: d.getMonth(), label: monthYear.format(d) };
  });
}

/** Trailing-edge debounce, so the list doesn't thrash while a fast flick crosses many days. */
function useSettledValue(value, delay = 120) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return settled;
}

/**
 * Returns a `tick()` that fires a light haptic click.
 * - Android / Chrome: `navigator.vibrate(8)`.
 * - iOS Safari (17.4+): it ignores `vibrate`, but toggling a hidden `<input type="checkbox" switch>`
 *   makes the system play its switch haptic, so we click a hidden label tied to one.
 *   This is a side effect rather than a documented API, so Apple could change it.
 */
function useTick() {
  const uid = useId();
  const labelRef = useRef(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.vibrate) return undefined; // vibrate path needs no DOM

    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.id = `haptic-${uid}`;
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");
    input.style.display = "none";

    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.setAttribute("aria-hidden", "true");
    label.style.display = "none";

    document.body.append(input, label);
    labelRef.current = label;
    return () => {
      labelRef.current = null;
      input.remove();
      label.remove();
    };
  }, [uid]);

  return useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(8); // small crisp click
    } else {
      labelRef.current?.click();
    }
  }, []);
}

/* -------------------------------------------------------------------------- */
/*  Mock ledger data (swap for real data)                                      */
/* -------------------------------------------------------------------------- */

const TX = [
  { merchant: "Blue Bottle", detail: "Coffee · Morning run", tag: "Coffee", amount: -5.5, time: "8:05 AM", kind: "std", icon: "coffee", pct: 62, people: 2 },
  { merchant: "City Transit", detail: "Transit · Commute", tag: "Transit", amount: -2.75, time: "7:42 AM", kind: "std", icon: "bus", pct: 35, people: 1 },
  { merchant: "Whole Foods", detail: "Groceries · Weekly shop", tag: "Groceries", amount: -64.2, time: "6:18 PM", kind: "std", icon: "cart", pct: 80, people: 3 },
  { merchant: "Nimbus Cloud", detail: "Subscription · Software", tag: "Subscription", amount: -12.99, time: "9:00 AM", kind: "std", icon: "laptop", pct: 45, people: 1 },
  { merchant: "Lakeside Rent", detail: "Housing · Monthly rent", tag: "High expense", amount: -1850, time: "10:00 AM", kind: "alt", icon: "home", pct: 96, people: 2 },
  { merchant: "Apple Store", detail: "Electronics · Laptop", tag: "High expense", amount: -1299, time: "3:24 PM", kind: "alt", icon: "laptop", pct: 88, people: 1 },
  { merchant: "Acme Payroll", detail: "Income · Salary", tag: "Income", amount: 3210, time: "9:00 AM", kind: "inc", icon: "wallet", pct: 100, people: 1 },
  { merchant: "Studio Kite", detail: "Income · Freelance invoice", tag: "Income", amount: 640, time: "11:30 AM", kind: "inc", icon: "wallet", pct: 64, people: 2 },
  { merchant: "Fresh Bowl", detail: "Dining · Lunch", tag: "Dining", amount: -14.8, time: "1:10 PM", kind: "std", icon: "coffee", pct: 52, people: 2 },
  { merchant: "Metro Fuel", detail: "Transport · Fuel", tag: "Transit", amount: -48.3, time: "5:45 PM", kind: "std", icon: "bus", pct: 58, people: 1 },
  { merchant: "Cinema Rex", detail: "Entertainment · Movies", tag: "Leisure", amount: -22, time: "8:15 PM", kind: "std", icon: "laptop", pct: 30, people: 3 },
];

// Hand-picked days from the original mockup (October 2026).
const OCT_2026 = {
  9: [1, 0, 8, 2], 10: [0, 10, 9], 11: [0, 8, 3], 12: [1, 0, 2, 8], 13: [1, 8, 5, 0],
  14: [0, 9, 7, 3], 15: [1, 0, 4, 8], 16: [6, 1, 0, 5], 17: [0, 10, 8], 18: [2, 0, 9],
  19: [1, 0, 8, 3], 20: [7, 0, 2], 21: [1, 0, 8, 9], 22: [0, 10, 5], 23: [1, 0, 6, 8],
};

const ICONS = { coffee: Coffee, bus: Bus, cart: ShoppingCart, laptop: Laptop, wallet: Wallet, home: Home };

const KIND = {
  std: { fill: "var(--card)", stroke: "var(--line)", fg: "var(--ink)", fg2: "var(--ink2)", diamond: "var(--bg)", icon: "var(--ink)", bar: "var(--sage)" },
  inc: { fill: "var(--sage)", stroke: "var(--sage)", fg: "var(--on-sage)", fg2: "var(--on-sage)", diamond: "var(--on-sage)", icon: "var(--sage)", bar: "var(--sage)" },
  alt: { fill: "var(--clay)", stroke: "var(--clay)", fg: "var(--on-clay)", fg2: "var(--on-clay)", diamond: "var(--on-clay)", icon: "var(--clay)", bar: "var(--clay)" },
};

const INITIALS = ["AK", "MR", "SJ"];
const AVATAR = [
  { bg: "var(--sage)", fg: "var(--on-sage)" },
  { bg: "var(--clay)", fg: "var(--on-clay)" },
  { bg: "var(--ink)", fg: "var(--bg)" },
];

const money = (a) =>
  (a > 0 ? "+" : "−") +
  "$" +
  Math.abs(a).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function transactionsFor(year, month, day) {
  let picks = year === 2026 && month === 9 ? OCT_2026[day] : undefined;
  if (!picks) {
    const n = 2 + ((day + month) % 3); // 2–4 entries, deterministic per day
    picks = Array.from({ length: n }, (_, k) => (day * 5 + month * 3 + k * 4) % TX.length);
  }
  return picks.map((i, k) => {
    const t = TX[i];
    return {
      ...t,
      amount: money(t.amount),
      people: INITIALS.slice(0, t.people).map((initials, j) => ({ initials, ...AVATAR[(j + k) % 3] })),
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Date capsule                                                               */
/* -------------------------------------------------------------------------- */

const PILL_IDLE = "border-[color:var(--line)] bg-[color:var(--pill)] text-[color:var(--pill-ink)]";
const PILL_ACTIVE = "border-transparent bg-[color:var(--pill-on)] text-[color:var(--pill-on-ink)]";

const DatePill = memo(function DatePill({ date, index, x, active, dist, onPick }) {
  // Signed distance from the focal axis, derived from the live scroll position.
  const offset = useTransform(x, (v) => index + v / PITCH);
  const transform = useTransform(offset, arcTransform);
  const opacity = useTransform(offset, (o) => sample(Math.abs(o), OPACITY_CURVE));

  return (
    <motion.button
      type="button"
      aria-label={date.label}
      aria-pressed={active}
      tabIndex={active ? 0 : -1}
      onClick={() => onPick(index)}
      style={{
        transform,
        opacity,
        zIndex: 10 - dist,
        pointerEvents: dist > VISIBLE ? "none" : "auto",
        fontFamily: GROTESK,
      }}
      className={`absolute left-1/2 top-4 -ml-[26px] flex h-20 w-[52px] origin-bottom cursor-[inherit] flex-col items-center justify-center rounded-[26px] border p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)] ${
        active ? PILL_ACTIVE : PILL_IDLE
      }`}
    >
      <span className="text-2xl font-bold leading-7 tracking-[-0.02em]" style={{ fontFamily: GROTESK_DISPLAY }}>
        {date.day}
      </span>
      <span className="text-[13px] leading-4">{date.weekday}</span>
    </motion.button>
  );
});

/* -------------------------------------------------------------------------- */
/*  Drag-to-scroll arc picker                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `x` is a virtual scroll offset: 0 = first day centred, -(n-1)·PITCH = last day centred.
 * Framer's drag engine writes to it (drag, inertia, elastic edges); every capsule derives its
 * arc position from it. The draggable track itself stays put (`transformTemplate` → none),
 * so the shared perspective origin and the focal axis never move.
 */
function SpinningDatePicker({ dates, initialIndex, onActiveChange, className = "" }) {
  const last = dates.length - 1;
  const start = clamp(initialIndex, 0, last);

  const x = useMotionValue(-start * PITCH);
  const [active, setActive] = useState(start);
  const activeRef = useRef(start);
  const trackRef = useRef(null);
  const dragged = useRef(false);
  const reduceMotion = useReducedMotion();
  const tick = useTick();

  // Capsule crosses the central activation boundary → hero state + haptic tick.
  useMotionValueEvent(x, "change", (v) => {
    const next = clamp(Math.round(-v / PITCH), 0, last);
    if (next === activeRef.current) return;
    activeRef.current = next;
    setActive(next);
    onActiveChange(dates[next].day);
    tick();
  });

  const dragTransition = useMemo(
    () => ({
      power: 0.2,
      timeConstant: 200,
      modifyTarget: (target) => snapToCapsule(target, last),
    }),
    [last]
  );

  const goTo = useCallback(
    (i) => {
      const target = -clamp(i, 0, last) * PITCH;
      if (reduceMotion) x.set(target);
      else animate(x, target, { type: "spring", stiffness: 320, damping: 28 });
    },
    [x, last, reduceMotion]
  );

  const pick = useCallback(
    (i) => {
      if (dragged.current) {
        dragged.current = false; // this click is the tail of a drag, not a tap
        return;
      }
      goTo(i);
    },
    [goTo]
  );

  const onKeyDown = (e) => {
    const cur = activeRef.current;
    const to =
      e.key === "ArrowRight" ? cur + 1 : e.key === "ArrowLeft" ? cur - 1 : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (to === null) return;
    e.preventDefault();
    const i = clamp(to, 0, last);
    goTo(i);
    trackRef.current?.children[i]?.focus({ preventScroll: true });
  };

  return (
    <div
      role="group"
      aria-label="Select a date"
      onKeyDown={onKeyDown}
      className={`relative h-[120px] touch-pan-y overflow-hidden ${className}`}
    >
      <motion.div
        ref={trackRef}
        drag="x"
        style={{ x, cursor: "grab" }}
        transformTemplate={() => "none"}
        dragConstraints={{ left: -last * PITCH, right: 0 }}
        dragElastic={0.1}
        dragTransition={dragTransition}
        whileTap={{ cursor: "grabbing" }}
        onPointerDown={() => (dragged.current = false)}
        onDragStart={() => (dragged.current = true)}
        className="absolute inset-0 select-none [perspective:900px]"
      >
        {dates.map((d, i) => (
          <DatePill
            key={d.day}
            date={d}
            index={i}
            x={x}
            active={i === active}
            dist={Math.min(Math.abs(i - active), 4)}
            onPick={pick}
          />
        ))}
      </motion.div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Month menu                                                                 */
/* -------------------------------------------------------------------------- */

function MonthMenu({ year, month, months, onPick }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-x-0 top-[88px] z-30 flex flex-col items-center">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="pointer-events-auto flex h-10 items-center gap-2 rounded-full px-3 text-xl font-bold leading-7 tracking-[-0.01em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)]"
        style={{ fontFamily: GROTESK_DISPLAY }}
      >
        {monthYear.format(new Date(year, month, 1))}
        <ChevronDown
          size={20}
          strokeWidth={1.5}
          aria-hidden="true"
          className={`text-[color:var(--sage)] transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Select month"
          className="pointer-events-auto mt-1 max-h-[220px] w-[208px] overflow-y-auto rounded-2xl border border-[color:var(--line)] bg-[color:var(--card)] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
        >
          {months.map((m) => {
            const selected = m.year === year && m.month === month;
            return (
              <li key={`${m.year}-${m.month}`} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onPick(m);
                  }}
                  className="flex h-10 w-full items-center justify-between rounded-xl px-3 text-left text-[13px] leading-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ink)]"
                  style={{ color: selected ? "var(--sage)" : "var(--ink)" }}
                >
                  <span className={selected ? "font-bold" : ""}>{m.label}</span>
                  {selected && <Check size={16} strokeWidth={1.5} aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Transaction card                                                           */
/* -------------------------------------------------------------------------- */

const CARD_PATH =
  "M0 20Q0 0 20 0H92C112 0 118 8 124 22C130 36 138 40 156 40H338Q358 40 358 60V108Q358 128 338 128H20Q0 128 0 108Z";

function TransactionCard({ tx }) {
  const k = KIND[tx.kind];
  const Icon = ICONS[tx.icon];
  return (
    <article className="relative h-[128px] w-full flex-none">
      <svg viewBox="0 0 358 128" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
        <path d={CARD_PATH} vectorEffect="non-scaling-stroke" strokeWidth={1} style={{ fill: k.fill, stroke: k.stroke }} />
      </svg>

      <div className="absolute left-4 top-3 whitespace-nowrap text-[10px] font-bold uppercase leading-4 tracking-[0.03em]" style={{ color: k.fg }}>
        {tx.tag}
      </div>

      <div className="absolute left-[41.3%] top-0 flex items-center">
        {tx.people.map((a) => (
          <span
            key={a.initials}
            className="-mr-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[color:var(--bg)] text-[10px] font-bold leading-4"
            style={{ background: a.bg, color: a.fg }}
          >
            {a.initials}
          </span>
        ))}
        <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[color:var(--bg)] bg-[color:var(--card)] text-[color:var(--ink)]">
          <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
        </span>
      </div>

      <div role="img" aria-label={`${tx.pct}% of category budget used`} className="absolute right-0 top-2 flex h-4 items-center gap-2">
        <span className="relative h-1 w-14 rounded-sm bg-[color:var(--line)]">
          <span className="absolute left-0 top-0 h-1 rounded-sm" style={{ width: `${tx.pct}%`, background: k.bar }} />
        </span>
        <span className="text-[color:var(--ink2)]">{tx.pct}%</span>
      </div>

      <div className="absolute inset-x-0 bottom-0 top-10 flex items-center justify-between p-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="relative h-14 w-14 flex-none">
            <span className="absolute left-2 top-2 h-10 w-10 rotate-45 rounded-xl" style={{ background: k.diamond }} />
            <span className="absolute left-4 top-4 flex" style={{ color: k.icon }}>
              <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
            </span>
          </span>
          <div className="min-w-0" style={{ color: k.fg }}>
            <div className="truncate text-base font-bold leading-6">{tx.merchant}</div>
            <div className="truncate" style={{ color: k.fg2 }}>
              {tx.detail}
            </div>
          </div>
        </div>
        <div className="ml-4 flex-none text-right" style={{ color: k.fg }}>
          <div className="text-base font-bold leading-6 tabular-nums" style={{ fontFamily: GROTESK_DISPLAY }}>
            {tx.amount}
          </div>
          <div style={{ color: k.fg2 }}>{tx.time}</div>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*  Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function DailyLedger({ today: todayProp, defaultTheme = "dark", backHref = "/" }) {
  const today = useMemo(() => todayProp ?? new Date(), [todayProp]);
  const [theme, setTheme] = useState(defaultTheme);
  const dark = theme === "dark";

  const [sel, setSel] = useState(() => ({ year: today.getFullYear(), month: today.getMonth(), day: today.getDate() }));
  const dates = useMonthDates(sel.year, sel.month, today);
  const months = useMemo(() => recentMonths(today), [today]);

  const settled = useSettledValue(sel, 120);
  const txs = useMemo(() => transactionsFor(settled.year, settled.month, settled.day), [settled]);

  const onActiveChange = useCallback((day) => setSel((s) => (s.day === day ? s : { ...s, day })), []);
  const pickMonth = useCallback(
    ({ year, month }) =>
      setSel((s) => ({ year, month, day: Math.min(s.day, buildMonthDates(year, month, today).length) })),
    [today]
  );

  return (
    <MotionConfig reducedMotion="user">
      <div
        data-theme={theme}
        style={{ ...THEMES[theme], fontFamily: GROTESK }}
        className="relative mx-auto min-h-[880px] w-full max-w-[390px] overflow-hidden bg-[color:var(--bg)] pb-10 font-sans text-[13px] leading-4 text-[color:var(--ink)] transition-colors duration-[350ms] [&_*]:transition-colors [&_*]:duration-[350ms] motion-reduce:[&_*]:transition-none"
      >
        <header className="relative h-[276px]">
          <svg viewBox="0 0 390 276" preserveAspectRatio="none" aria-hidden="true" className="absolute left-0 top-0 h-[276px] w-full">
            <path d="M0 0H390V273Q195 231 0 273Z" style={{ fill: "var(--card)" }} />
            <path d="M0 273Q195 231 390 273" vectorEffect="non-scaling-stroke" style={{ fill: "none", stroke: "var(--line)", strokeWidth: 1 }} />
          </svg>

          <div className="absolute inset-x-4 top-6 flex h-12 items-center justify-between">
            <a
              href={backHref}
              aria-label="Back to dashboard"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--line)] bg-[color:var(--card)] text-[color:var(--ink)] no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)]"
            >
              <ArrowLeft size={24} strokeWidth={1.5} aria-hidden="true" />
            </a>

            <h1 className="m-0 text-lg font-medium leading-6 tracking-[-0.01em]" style={{ fontFamily: GROTESK_DISPLAY }}>
              Daily ledger
            </h1>

            <button
              type="button"
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              aria-pressed={!dark}
              onClick={() => setTheme(dark ? "light" : "dark")}
              className="relative flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-[color:var(--line)] bg-[color:var(--card)] p-0 text-[color:var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)]"
            >
              <motion.span
                className="absolute flex"
                initial={false}
                animate={{ opacity: dark ? 1 : 0, rotate: dark ? 0 : 90, scale: dark ? 1 : 0.4 }}
                transition={{ opacity: { duration: 0.25 }, default: { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] } }}
              >
                <Sun size={24} strokeWidth={1.5} aria-hidden="true" />
              </motion.span>
              <motion.span
                className="absolute flex"
                initial={false}
                animate={{ opacity: dark ? 0 : 1, rotate: dark ? -90 : 0, scale: dark ? 0.4 : 1 }}
                transition={{ opacity: { duration: 0.25 }, default: { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] } }}
              >
                <Moon size={24} strokeWidth={1.5} aria-hidden="true" />
              </motion.span>
            </button>
          </div>

          <MonthMenu year={sel.year} month={sel.month} months={months} onPick={pickMonth} />

          {dates.length > 0 && (
            <SpinningDatePicker
              key={`${sel.year}-${sel.month}`}
              dates={dates}
              initialIndex={sel.day - 1}
              onActiveChange={onActiveChange}
              className="absolute inset-x-0 top-[136px]"
            />
          )}
        </header>

        <section
          aria-label={`Transactions for ${dates[clamp(settled.day - 1, 0, Math.max(dates.length - 1, 0))]?.label ?? ""}`}
          className="px-4 pt-6"
        >
          <motion.div
            key={`${settled.year}-${settled.month}-${settled.day}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex flex-col gap-2"
          >
            {txs.map((tx) => (
              <TransactionCard key={`${tx.merchant}-${tx.time}`} tx={tx} />
            ))}
          </motion.div>
        </section>
      </div>
    </MotionConfig>
  );
}
