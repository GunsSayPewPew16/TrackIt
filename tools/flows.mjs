#!/usr/bin/env node
/**
 * The flows check: the three things the owner asked for, driven in a real browser.
 *
 * `INSTRUCTIONS.md` says a build, a clean exit code or an HTTP 200 is not evidence that a
 * screen renders or that a gesture works, and that the checks worth doing are done in a real
 * Chrome over the DevTools protocol. Doing that by hand every time is how a regression slips
 * through, so the three owner-requested flows live here as assertions:
 *
 *   1. **The add-record switch** — Expense/Income only on that screen, the income tree with
 *      its own tiles and envelopes, the confirm's wording, and the *kind* that lands in the
 *      store (so a wage can never be counted as spending). A scanned code opens the same
 *      screen as a payment and has no switch at all.
 *   2. **The Friends pill** — under Life & Leisure, whose tile reads the capitalised name,
 *      filing `category: "friends"` — and still doing so after a reload, which is the one
 *      place `lib/refile.ts` could quietly re-home it.
 *   3. **The date card** — opens on the current moment, cannot be closed by anything but
 *      `done` (the scrim is not a door), pages its months on a swipe without the day under
 *      the finger becoming the choice, and hands the moment back to the pill.
 *
 * **What it is not.** Not a unit-test suite, not a screenshot baseline, and not a cover of
 * the iOS-only paths: the switch-click haptics and the platform's own time wheel need a
 * phone, and `INSTRUCTIONS.md` says so. It also does not assert figures — the dashboard's
 * numbers are `lib/derive.ts`'s business and are checked by reading the page.
 *
 * **Four traps it is built around**, three of them from `INSTRUCTIONS.md`:
 *
 * - **Never read a value in the same task as the change that sets it.** The palette tokens
 *   *transition* on `:root` (`index.css`), so a `getComputedStyle` in the same task as an
 *   attribute write reads the palette being replaced. Every read here is its own round trip.
 * - **A frozen animation is not a layout, and a scripted `click()` is not a press.** Gestures
 *   here are real mouse input over CDP (`Input.dispatchMouseEvent`), so a drag is a drag and
 *   a control under an overlay cannot be "pressed" by reaching past it.
 * - **State lives in `localStorage`, and a fresh profile is what makes that deterministic.**
 *   The browser is launched with a throwaway profile, so the owner's own ledger (and their
 *   palette) can never leak in, and this check can never write into theirs.
 * - **A native time wheel cannot be driven from CDP.** The card's `input[type=time]` is the
 *   device's own control, so the one synthetic step in this file sets its value through the
 *   native setter and dispatches `input` — which is exactly the contract the component reads.
 *   Everything else on this list is a real press.
 *
 * Usage:
 *
 *     npm run check:flows                     # starts the dev server if it is not already up
 *     APP_URL=http://127.0.0.1:4324/ npm run check:flows
 *     TRACKIT_HEADED=1 npm run check:flows    # watch it, in a window
 *
 * Exit codes: 0 everything passed, 1 an assertion failed, 2 the check could not run (no
 * browser, or the app never answered) — a missing Chrome is not mistaken for a green run.
 */

import { spawn } from "node:child_process"
import { existsSync, rmSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:4323/"
const HEADED = process.env.TRACKIT_HEADED === "1"
const KEEP_PROFILE = process.env.TRACKIT_KEEP_PROFILE === "1"

/** The phone the design is drawn for: 390 wide, and tall enough for the sheet's full column. */
const VIEWPORT = { width: 390, height: 844, dpr: 2 }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/* ------------------------------------------------------------------ *
 * A very small CDP client
 * ------------------------------------------------------------------ */

class Cdp {
  constructor(socket) {
    this.socket = socket
    this.id = 0
    this.pending = new Map()
    this.waiters = []
    this.consoleErrors = []
    this.exceptions = []
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data)
      if (message.id) {
        const entry = this.pending.get(message.id)
        if (!entry) return
        this.pending.delete(message.id)
        if (message.error) entry.reject(new Error(message.error.message))
        else entry.resolve(message.result)
        return
      }
      if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
        this.consoleErrors.push(
          message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(" "),
        )
      }
      if (message.method === "Runtime.exceptionThrown") {
        this.exceptions.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
      }
      for (const waiter of [...this.waiters]) {
        if (waiter.method !== message.method) continue
        this.waiters.splice(this.waiters.indexOf(waiter), 1)
        waiter.resolve(message.params)
      }
    })
  }

  static async connect(url) {
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true })
      socket.addEventListener("error", () => reject(new Error(`could not open ${url}`)), { once: true })
    })
    return new Cdp(socket)
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  /** Resolve on the next event of this kind, or reject after `timeout`. */
  waitFor(method, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const waiter = { method, resolve }
      this.waiters.push(waiter)
      setTimeout(() => {
        const index = this.waiters.indexOf(waiter)
        if (index < 0) return
        this.waiters.splice(index, 1)
        reject(new Error(`timed out waiting for ${method}`))
      }, timeout)
    })
  }

  /** Evaluate in the page and hand back the value. An exception in the page is thrown here. */
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    })
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
      throw new Error(`page threw: ${detail}`)
    }
    return result.result.value
  }

  async goto(url) {
    const loaded = this.waitFor("Page.loadEventFired")
    await this.send("Page.navigate", { url })
    await loaded
    // A beat for the first render: the dashboard's models are derived on that paint.
    await sleep(700)
  }

  close() {
    try {
      this.socket.close()
    } catch {
      // Already gone; Chrome may have been killed first.
    }
  }
}

/* ------------------------------------------------------------------ *
 * Getting a browser and an app to drive
 * ------------------------------------------------------------------ */

/** Where Chrome lives on this machine, in the order worth trying. */
function findBrowser() {
  const candidates = [
    process.env.TRACKIT_CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean)
  return candidates.find((path) => existsSync(path)) ?? null
}

/**
 * Launch a browser with a throwaway profile.
 *
 * The profile matters more than the flags: the ledger, the budgets and the palette all live
 * in `localStorage`, so a profile of its own is what makes this deterministic in both
 * directions. The fake media device is for the scan screen, whose camera is the one piece of
 * hardware a headless browser has to be told to have.
 */
async function launchBrowser(binary) {
  const profile = await mkdtemp(join(tmpdir(), "trackit-flows-"))
  const args = [
    ...(HEADED ? [] : ["--headless=new"]),
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-component-update",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--hide-scrollbars",
    "--mute-audio",
    `--window-size=${VIEWPORT.width},${VIEWPORT.height + 200}`,
    "about:blank",
  ]
  const child = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] })

  // Chrome picks the port itself and says which on stderr; that is steadier than guessing one.
  const endpoint = await new Promise((resolve, reject) => {
    let buffered = ""
    const timer = setTimeout(() => reject(new Error("Chrome never announced a debugging port")), 20000)
    child.stderr.on("data", (chunk) => {
      buffered += String(chunk)
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(buffered)
      if (!match) return
      clearTimeout(timer)
      resolve(match[1])
    })
    child.on("exit", (code) => {
      clearTimeout(timer)
      reject(new Error(`Chrome exited with ${code} before it was ready`))
    })
  })

  return { child, profile, port: new URL(endpoint).port }
}

/** A tab of its own, so the check never fights with a window the owner has open. */
async function openTab(port) {
  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`, {
    method: "PUT",
  }).then((response) => response.json())
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl)
  await cdp.send("Page.enable")
  await cdp.send("Runtime.enable")
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    deviceScaleFactor: VIEWPORT.dpr,
    mobile: false,
    screenWidth: VIEWPORT.width,
    screenHeight: VIEWPORT.height,
  })
  return cdp
}

/** Whether the app answers at all — a refused connection is not this check's to fail. */
async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

/**
 * The dev server, if it is not already running.
 *
 * A check nobody can run is a check nobody runs, so this starts Vite itself and stops it
 * again at the end. A server that was already up is left exactly as it was found — the
 * owner may be watching it in the Preview panel — which is why the one it starts is a
 * **device-only** build (`VITE_CLOUD=off`): `lib/supabase-config.ts` gives every other build
 * the project, and a gated app would stop at the portal unless a test account is provided.
 */
async function ensureApp() {
  const deadline = Date.now() + 40000
  if (await reachable(APP_URL)) return null
  const server = spawn("npm", ["run", "dev"], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, VITE_CLOUD: "off" },
  })
  while (Date.now() < deadline) {
    await sleep(500)
    if (await reachable(APP_URL)) return server
  }
  stop(server)
  throw new Error(`${APP_URL} never came up — start it with \`npm run dev\` and try again`)
}

function stop(child) {
  if (!child || child.exitCode !== null) return
  try {
    // The whole group: `npm run dev` is a shell around Vite, and Vite holds the port.
    process.kill(-child.pid, "SIGTERM")
  } catch {
    try {
      child.kill("SIGTERM")
    } catch {
      // Already gone.
    }
  }
}

/* ------------------------------------------------------------------ *
 * The checks
 * ------------------------------------------------------------------ */

const results = []
const notes = []

/** One named check. A throw inside it is a failure with the message attached. */
async function check(name, run) {
  try {
    await run()
    results.push({ name, ok: true })
    process.stdout.write(`  \u001b[32m\u2713\u001b[0m ${name}\n`)
  } catch (error) {
    results.push({ name, ok: false, detail: error.message })
    process.stdout.write(`  \u001b[31m\u2717\u001b[0m ${name}\n      ${error.message}\n`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertEqual(actual, expected, what) {
  if (actual !== expected) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

const SHEET = '[role=dialog][aria-label="Manual record entry"]'
const PAYMENT = '[role=dialog][aria-label="Pay and log transaction"]'
const DIALOG = '[role=dialog][aria-label="Date and time"]'
const TYPE_SWITCH = '[role=radiogroup][aria-label="Record type"]'
const MOSAIC = "[role=group][aria-label=Categories]"
/** The date card's day cells, found by their own reading rather than by a class name. */
const DAY_READING = /^[A-Z][a-z]+ \d{1,2}, \d{4}$/

/**
 * The page as a person uses it: presses and drags are real input at real coordinates.
 *
 * Coordinates rather than `element.click()` on purpose — the app's controls sit under
 * Framer's drag layers and a route that swaps screens, and a scripted `click()` on a covered
 * element still fires. A mouse press at a point does what a thumb does.
 */
class Screen {
  constructor(cdp) {
    this.cdp = cdp
  }

  async open(url) {
    await this.cdp.goto(url)
  }

  /** Poll a page expression until it is truthy, then hand it back. */
  async until(expression, description, timeout = 6000) {
    const deadline = Date.now() + timeout
    let last = null
    while (Date.now() < deadline) {
      last = await this.cdp.evaluate(expression)
      if (last) return last
      await sleep(120)
    }
    throw new Error(`timed out waiting for ${description}`)
  }

  /** The centre of the first element matching a selector, scrolled into view. */
  async point(selector, { index = 0 } = {}) {
    const point = await this.cdp.evaluate(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(selector)})][${index}];
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`)
    assert(point, `nothing matches ${selector}`)
    return point
  }

  async press(selector, options) {
    await this.pressPoint(await this.point(selector, options))
  }

  async pressPoint({ x, y }, settle = 450) {
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1, buttons: 1 })
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1, buttons: 0 })
    await sleep(settle)
  }

  /** Press the first element whose trimmed text is exactly `text`, inside `within`. */
  async pressText(within, text, settle = 600) {
    const index = await this.cdp.evaluate(`[...document.querySelectorAll(${JSON.stringify(`${within} button`)})]
      .findIndex((node) => node.textContent.trim() === ${JSON.stringify(text)})`)
    assert(index >= 0, `no button reading "${text}" inside ${within}`)
    await this.press(`${within} button`, { index })
    await sleep(settle)
  }

  /** A real drag: press, move in steps, release. Used for the date card's months. */
  async drag(from, to, steps = 8) {
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", clickCount: 1, buttons: 1 })
    for (let step = 1; step <= steps; step += 1) {
      await this.cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: Math.round(from.x + ((to.x - from.x) * step) / steps),
        y: Math.round(from.y + ((to.y - from.y) * step) / steps),
        button: "left",
        buttons: 1,
      })
      await sleep(16)
    }
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: to.y, button: "left", clickCount: 1, buttons: 0 })
    await sleep(700)
  }

  /** What the page's own store holds, which is what a reload will show. */
  rows() {
    return this.cdp.evaluate(`(() => {
      const store = JSON.parse(localStorage.getItem("trackit-ledger") ?? '{"rows":[]}');
      return store.rows;
    })()`)
  }

  text(selector) {
    return this.cdp.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`)
  }

  /** The month the card is showing, by its reading: the only text shaped `October 2026`. */
  monthInCard() {
    return this.cdp.evaluate(`(() => {
      const card = document.querySelector(${JSON.stringify(DIALOG)});
      if (!card) return null;
      return [...card.querySelectorAll("span, p, div")]
        .map((node) => node.textContent?.trim() ?? "")
        .find((text) => /^[A-Z][a-z]+ \\d{4}$/.test(text)) ?? null;
    })()`)
  }

  /** The day cells' union box, so a swipe can travel across the grid rather than a label. */
  dayGrid() {
    return this.cdp.evaluate(`(() => {
      const read = ${DAY_READING.toString()};
      const cells = [...document.querySelectorAll(${JSON.stringify(`${DIALOG} button[aria-label]`)})]
        .filter((node) => read.test(node.getAttribute("aria-label")));
      if (cells.length === 0) return null;
      const rects = cells.map((node) => node.getBoundingClientRect());
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));
      const top = Math.min(...rects.map((r) => r.top));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      return { left, right, top, bottom, middle: Math.round((top + bottom) / 2), count: cells.length };
    })()`)
  }

  /** The day the card has selected, as `{ label, number, month }`. */
  selected() {
    return this.cdp.evaluate(`(() => {
      const button = document.querySelector(${JSON.stringify(`${DIALOG} button[aria-pressed=true]`)});
      if (!button) return null;
      const label = button.getAttribute("aria-label");
      const [, month, day] = /^([A-Z][a-z]+) (\\d{1,2}), (\\d{4})$/.exec(label) ?? [];
      return { label, number: Number(day), month };
    })()`)
  }

  /**
   * Open the category mosaic from its closed row.
   *
   * The mosaic is always mounted — closed it is 56px tall, `inert` and at zero opacity — so
   * its tiles are in the DOM and measurably *squashed* the moment the sheet opens. A press on
   * one before the panel is open lands on nothing. The signal that it is open is the closed
   * row's own button, which unmounts when `expanded` flips.
   */
  async openMosaic() {
    await this.press('[aria-label="Choose a category"]', { index: 0 })
    await this.until(
      `document.querySelector('[aria-label="Choose a category"]') === null`,
      "the category mosaic to open",
    )
  }

  /** Wait for the keypad to be back — it leaves the column while the mosaic is open. */
  keypad() {
    return this.until(
      `document.querySelector(${JSON.stringify(`${SHEET} [aria-label="5"]`)}) !== null`,
      "the keypad",
    )
  }
}

/* ------------------------------------------------------------------ *
 * The flows
 * ------------------------------------------------------------------ */

/** Type a figure on the keypad, one real press per digit. */
async function typeAmount(screen, digits) {
  for (const digit of digits) await screen.press(`${SHEET} [aria-label="${digit}"]`, { index: 0 })
  await sleep(180)
}

async function openSheet(screen) {
  await screen.press('[aria-label="Add Record"]', { index: 0 })
  await screen.until(`document.querySelector(${JSON.stringify(SHEET)}) !== null`, "the add-record sheet")
}

/**
 * The rows the ledger gained since `before`.
 *
 * Two things make this more than a filter. The owner's imported history carries
 * `source: "manual"` on its own rows, so that field cannot identify a typed one. And the first
 * write on a fresh profile is the one that *persists the seed* — `localStorage` is empty until
 * something changes — so the "before" snapshot of that write is an empty array and a plain
 * difference would hand back the whole ledger. The app ids a typed row `manual-<moment>-<tail>`
 * (`App.tsx`), which is precise and survives the seed appearing beside it.
 */
async function addedRows(screen, before) {
  const ids = new Set(before.map((row) => row.id))
  return (await screen.rows()).filter((row) => row.id.startsWith("manual-") && !ids.has(row.id))
}

/**
 * Get past the portal, when this build has one.
 *
 * A cloud build opens on the login screen and nothing behind it is reachable without an account
 * — that is the requirement, not an accident. The flows below are the signed-in app, so this
 * signs in with a **test account** and says which of three things happened:
 *
 * - `"device"` — the build has no Supabase values, so there is no portal and the app is the
 *   device-only tracker. The flows run exactly as they always have.
 * - `"signed-in"` — the portal accepted `TRACKIT_TEST_EMAIL` / `TRACKIT_TEST_PASSWORD` and the
 *   dashboard is up. The session lives in the browser profile for the rest of the run, so the
 *   flows' own `open(APP_URL)` calls land on the dashboard rather than the portal again.
 * - `"portal"` — the app gates and no test account was given. The portal's own checks still run,
 *   and the script exits 2 ("cannot run") rather than pretending the signed-in app passed.
 * - `"code"` — the password was accepted and the portal is waiting for the six digits it just
 *   emailed. A script cannot read an inbox, so this is also a "cannot run" (exit 2) unless
 *   `TRACKIT_TEST_CODE` carries a code that is still valid — a check a person runs by hand,
 *   within the code's five minutes.
 */
async function enterApp(screen) {
  await screen.open(APP_URL)
  await sleep(1400)
  const portal = await screen.cdp.evaluate(`document.querySelector('[aria-label="Email"]') !== null`)
  if (!portal) return "device"

  const email = process.env.TRACKIT_TEST_EMAIL
  const password = process.env.TRACKIT_TEST_PASSWORD
  if (!email || !password) return "portal"

  await screen.press('[aria-label="Email"]')
  await screen.cdp.send("Input.insertText", { text: email })
  await screen.press('[aria-label="Password"]')
  await screen.cdp.send("Input.insertText", { text: password })
  await screen.press('button[type="submit"]')

  /** Whichever of the two things a right password leads to. */
  const afterPassword = () =>
    `(() => {
      if (document.querySelector('[aria-label="Six-digit code"]')) return "code";
      if (document.querySelector('[aria-label="Add Record"]')) return "dashboard";
      return null;
    })()`
  const reached = await screen.until(afterPassword(), "the code step or the dashboard", 25000)
  if (reached === "dashboard") return "signed-in"

  const code = process.env.TRACKIT_TEST_CODE
  if (!code) return "code"
  await screen.press('[aria-label="Six-digit code"]')
  await screen.cdp.send("Input.insertText", { text: code })
  await screen.press('button[type="submit"]')
  await screen.until(
    `document.querySelector('[aria-label="Add Record"]') !== null`,
    "the dashboard after the code",
    25000,
  )
  return "signed-in"
}

/**
 * The portal, checked on its own terms.
 *
 * What is assertable without an account: both fields exist by the names the screen gives them,
 * the submit is refuse-to-press until both are filled, and **there is no way to create an
 * account** — the vault holds the accounts its owner made, so the portal says sign-ups are
 * closed rather than offering a form that would be refused. Those are the three ways this
 * screen can silently rot.
 */
async function flowPortal(screen) {
  await check("portal: a signed-out build asks for an email and a password", async () => {
    const fields = await screen.cdp.evaluate(`(() => {
      const email = document.querySelector('[aria-label="Email"]');
      const password = document.querySelector('[aria-label="Password"]');
      const submit = document.querySelector('button[type="submit"]');
      return email && password && submit
        ? { emailType: email.type, passwordType: password.type, disabled: submit.disabled }
        : null;
    })()`)
    assert(fields, "no email/password portal on a signed-out build")
    assertEqual(fields.emailType, "email", "the email field's type")
    assertEqual(fields.passwordType, "password", "the password field's type")
    assertEqual(fields.disabled, true, "the submit button before anything is typed")
  })

  await check("portal: sign-ups are closed, and the screen says so", async () => {
    const state = await screen.cdp.evaluate(`(() => {
      const buttons = [...document.querySelectorAll("form button[type=button]")].map((node) =>
        node.textContent.trim(),
      );
      return {
        buttons,
        nameField: document.querySelector('[aria-label="Your name"]') !== null,
        body: document.body.innerText,
      };
    })()`)
    assert(
      !state.buttons.some((label) => /create an account/i.test(label)),
      `the portal still offers a way to create an account: ${state.buttons.join(", ")}`,
    )
    assertEqual(state.nameField, false, "a name field on a portal with no sign-up")
    assert(
      /sign-ups are closed/i.test(state.body),
      "the portal does not say that sign-ups are closed",
    )
  })
}

async function flowAddRecordSwitch(screen) {
  await check("add-record: the dashboard's pill opens the sheet, on Expense", async () => {
    await screen.open(APP_URL)
    await openSheet(screen)
    const options = await screen.cdp.evaluate(`(() => {
      const group = document.querySelector('${TYPE_SWITCH}');
      if (!group) return null;
      return {
        role: group.getAttribute("role"),
        options: [...group.querySelectorAll('[role=radio]')].map((node) => ({
          text: node.textContent.trim(),
          checked: node.getAttribute("aria-checked"),
        })),
      };
    })()`)
    assert(options, "no Record type switch in the header")
    assertEqual(options.role, "radiogroup", "the switch's role")
    assertEqual(
      JSON.stringify(options.options),
      JSON.stringify([
        { text: "Expense", checked: "true" },
        { text: "Income", checked: "false" },
      ]),
      "the switch's two options",
    )
  })

  await check("add-record: Income draws the income tree, not the spending one", async () => {
    await screen.pressText(TYPE_SWITCH, "Income")
    const tiles = await screen.until(
      `(() => {
        const tiles = [...document.querySelectorAll("${MOSAIC} button")].map((node) => node.textContent.trim());
        return tiles.length === 6 && tiles[0] === "Salary & bonus" ? tiles : null;
      })()`,
      "the income mosaic",
    )
    assertEqual(
      JSON.stringify(tiles),
      JSON.stringify(["Salary & bonus", "Interest", "Freelance", "Refunds", "Gifts & winnings", "Other"]),
      "the income mosaic's tiles",
    )
  })

  await check("add-record: an income is filed as income, under an income envelope", async () => {
    await screen.openMosaic()
    await screen.pressText(MOSAIC, "Salary & bonus")
    await screen.until(`document.querySelector('[aria-label="Salary & Bonus sub-categories"]') !== null`, "the Salary tray")
    await screen.pressText('[aria-label="Salary & Bonus sub-categories"]', "Salary")
    // The tray folds back a beat after the pick, and the keypad returns with it.
    await screen.keypad()

    await typeAmount(screen, ["5", "0", "0", "0"])
    const confirms = await screen.cdp.evaluate(`(() => {
      const sheet = document.querySelector(${JSON.stringify(SHEET)});
      return [...sheet.querySelectorAll("button")].map((node) => node.textContent.trim())
        .filter((text) => text === "Add Income" || text === "Add Record");
    })()`)
    assertEqual(JSON.stringify(confirms), JSON.stringify(["Add Income"]), "the confirm's wording for money in")

    const before = await screen.rows()
    await screen.pressText(SHEET, "Add Income", 1200)
    const written = await addedRows(screen, before)
    assertEqual(written.length, 1, "rows this check wrote")
    assertEqual(written[0].kind, "income", "the row's kind")
    assertEqual(written[0].amountCents, 500000, "the row's amount in paise")
    assertEqual(written[0].category, "wage-invoices", "the envelope an income files under")
  })

  await check("add-record: a scanned code opens a payment, which has no switch", async () => {
    await screen.press('[aria-label="Scan a receipt"]', { index: 0 })
    // The scan screen is a lazy route, and on a cold dev server that module still has to be
    // compiled and fetched — so this wait is the one that is generous on purpose.
    await screen.until(`document.querySelector("#scan-manual") !== null`, "the scan screen's manual field", 20000)
    await screen.press("#scan-manual", { index: 0 })
    // The field's own prompt is `pa=name@bank` — a bare VPA is not a code the parser takes.
    await screen.cdp.send("Input.insertText", { text: "pa=priya@okaxis" })
    await sleep(200)
    await screen.pressText("form", "Use it")
    const payee = await screen.until(
      `(() => {
        const sheet = document.querySelector(${JSON.stringify(PAYMENT)});
        if (!sheet) return null;
        return {
          switch: sheet.querySelector('${TYPE_SWITCH}') !== null,
          title: [...sheet.querySelectorAll("header span")].map((node) => node.textContent.trim()).filter(Boolean),
          confirm: [...sheet.querySelectorAll("button")].map((node) => node.textContent.trim()).filter((text) => /^(Add |Pay and)/.test(text)),
          payee: sheet.textContent.includes("priya@okaxis"),
        };
      })()`,
      "the payment screen",
      15000,
    )
    assertEqual(payee.switch, false, "the payment screen showing a Record type switch")
    assert(payee.title.includes("New expense"), `the payment screen's title: ${JSON.stringify(payee.title)}`)
    assertEqual(JSON.stringify(payee.confirm), JSON.stringify(["Pay and Log Transaction"]), "the payment screen's confirm")
    assert(payee.payee, "the payment screen not naming the scanned payee")

    await screen.press(`${PAYMENT} [aria-label="Close"]`, { index: 0 })
    await screen.until(`document.querySelector(${JSON.stringify(PAYMENT)}) === null`, "the payment screen to close")
  })
}

async function flowFriendsPill(screen) {
  await check("friends: Life & Leisure is capitalised and its tray offers Friends", async () => {
    await screen.open(APP_URL)
    await openSheet(screen)
    await screen.openMosaic()
    const captions = await screen.cdp.evaluate(`[...document.querySelectorAll("${MOSAIC} button")].map((node) => node.textContent.trim())`)
    assert(captions.includes("Life & Leisure"), `no tile reading "Life & Leisure" (tiles: ${captions.join(", ")})`)
    assert(!captions.includes("Life & leisure"), "a tile still reads the old lowercase name")

    await screen.pressText(MOSAIC, "Life & Leisure")
    const pills = await screen.until(
      `(() => {
        const tray = document.querySelector('[aria-label="Life & Leisure sub-categories"]');
        return tray ? [...tray.querySelectorAll("button")].map((node) => node.textContent.trim()) : null;
      })()`,
      "the Life & Leisure tray",
    )
    assert(pills.includes("Friends"), `no Friends pill (tray: ${pills.join(", ")})`)
  })

  await check("friends: a row filed under Friends keeps that envelope, over a reload", async () => {
    await screen.pressText('[aria-label="Life & Leisure sub-categories"]', "Friends")
    await screen.until(
      `document.querySelector('[aria-label="Category: Life & Leisure, Friends. Change category"]') !== null`,
      "the collapsed row reading Life & Leisure • Friends",
    )

    await screen.keypad()
    const before = await screen.rows()
    await typeAmount(screen, ["1", "0"])
    await screen.pressText(SHEET, "Add Record", 1200)

    const filed = await addedRows(screen, before)
    assertEqual(filed.length, 1, "the Friends row this check wrote")
    assertEqual(filed[0].category, "friends", "the envelope the row was filed under")
    assertEqual(filed[0].kind, "expense", "a Friends row's kind")
    assertEqual(filed[0].amountCents, 1000, "a Friends row's amount in paise")

    // The read path re-files every stored row, and `friends` is the one that used to be
    // re-homed away from its own envelope. A reload is what proves it is not any more.
    await screen.open(APP_URL)
    const after = (await screen.rows()).find((row) => row.id === filed[0].id)
    assertEqual(after?.category, "friends", "the envelope after a reload")
  })
}

async function flowDateCard(screen) {
  await check("date card: opens on the current moment, and only done closes it", async () => {
    await screen.open(APP_URL)
    await openSheet(screen)
    const now = await screen.cdp.evaluate(`(() => {
      const when = new Date();
      return {
        clock: when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
        day: new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric" }).format(when),
        time: String(when.getHours()).padStart(2, "0") + ":" + String(when.getMinutes()).padStart(2, "0"),
      };
    })()`)
    const pill = await screen.cdp.evaluate(`document.querySelector('[aria-label^="Date and time"]')?.getAttribute("aria-label")`)
    assertEqual(pill, `Date and time: Today at ${now.clock}. Change`, "the pill before the card is opened")

    await screen.press('[aria-label^="Date and time"]', { index: 0 })
    await screen.until(`document.querySelector(${JSON.stringify(DIALOG)}) !== null`, "the date card")
    const opened = await screen.cdp.evaluate(`(() => {
      const card = document.querySelector(${JSON.stringify(DIALOG)});
      const pressed = card.querySelector("button[aria-pressed=true]");
      return {
        selected: pressed?.getAttribute("aria-label") ?? null,
        time: card.querySelector("input[type=time]")?.value ?? null,
        closeButtons: [...card.querySelectorAll("button")].filter((node) => /close/i.test(node.getAttribute("aria-label") ?? "")).length,
      };
    })()`)
    assertEqual(opened.selected, now.day, "the day the card opens on")
    assertEqual(opened.time, now.time, "the time the card opens on")
    assertEqual(opened.closeButtons, 0, "close buttons drawn in the card")

    // The scrim: a press on it is not a door any more.
    await screen.pressPoint({ x: 8, y: 60 })
    assert(await screen.cdp.evaluate(`document.querySelector(${JSON.stringify(DIALOG)}) !== null`), "a scrim press closed the card")

    // A day press keeps it open too — the time is usually the next thing wanted.
    const anEarlierDay = `(() => {
      const read = ${DAY_READING.toString()};
      const card = document.querySelector(${JSON.stringify(DIALOG)});
      const button = [...card.querySelectorAll("button[aria-label]")]
        .find((node) => read.test(node.getAttribute("aria-label")) && node.getAttribute("aria-pressed") === "false" && !node.disabled);
      return button?.getAttribute("aria-label") ?? null;
    })()`
    let earlier = await screen.cdp.evaluate(anEarlierDay)
    if (!earlier) {
      // The 1st of a month: every other day of it is future and disabled, so the earlier day
      // is in the month before — which is also the first proof that paging keeps working.
      await screen.press(`${DIALOG} [aria-label="Previous month"]`, { index: 0 })
      await sleep(500)
      earlier = await screen.cdp.evaluate(anEarlierDay)
    }
    assert(earlier, "no day to press in the card")
    await screen.press(`${DIALOG} button[aria-label="${earlier}"]`, { index: 0 })
    assertEqual((await screen.selected()).label, earlier, "the day a press selects")
    assert(await screen.cdp.evaluate(`document.querySelector(${JSON.stringify(DIALOG)}) !== null`), "a day press closed the card")
    await sleep(2000)
    assert(await screen.cdp.evaluate(`document.querySelector(${JSON.stringify(DIALOG)}) !== null`), "the card closed itself while it was idle")
  })

  await check("date card: the months page on a swipe, and the day does not travel with the finger", async () => {
    const start = await screen.monthInCard()
    const before = await screen.selected()
    const grid = await screen.dayGrid()
    assert(grid, "no day cells in the card")

    // Right, then left, across the grid's middle: back a month and forward again.
    await screen.drag({ x: grid.left + 8, y: grid.middle }, { x: grid.right - 8, y: grid.middle })
    const backMonth = await screen.monthInCard()
    assert(backMonth !== start, `a right swipe did not page the month (still ${backMonth})`)

    const backGrid = await screen.dayGrid()
    const afterSwipe = await screen.selected()
    // `shiftMonth` keeps the day number where the month has it and never passes today, so
    // paging is not a pick — and it is not the day under the finger either.
    assertEqual(afterSwipe.number, Math.min(before.number, backGrid.count), "the day selected by a swipe")
    assert(backMonth.startsWith(afterSwipe.month), `the selection (${afterSwipe.label}) left the month shown (${backMonth})`)

    await screen.drag({ x: grid.right - 8, y: grid.middle }, { x: grid.left + 8, y: grid.middle })
    assertEqual(await screen.monthInCard(), start, "a left swipe back to the month it started on")
    assertEqual((await screen.selected()).number, before.number, "the day selected after two swipes")

    const forwardClosed = await screen.cdp.evaluate(`document.querySelector('${DIALOG} [aria-label="Next month"]')?.disabled`)
    assertEqual(forwardClosed, true, "the forward chevron at the current month being closed")

    await screen.press(`${DIALOG} [aria-label="Previous month"]`, { index: 0 })
    await sleep(500)
    const chevronMonth = await screen.monthInCard()
    assert(chevronMonth !== start, "the previous-month chevron did not page the month")
    assertEqual(chevronMonth, backMonth, "the chevron and the swipe landing on the same month")
  })

  await check("date card: done hands the moment to the pill and to the row", async () => {
    // Its own sheet, opened fresh: the card always opens on the month of the moment it was
    // handed, and the swipe check above leaves it pages away from the current one.
    await screen.open(APP_URL)
    await openSheet(screen)
    await screen.press('[aria-label^="Date and time"]', { index: 0 })
    await screen.until(`document.querySelector(${JSON.stringify(DIALOG)}) !== null`, "the date card")

    // Yesterday, because it is the one day whose label is deterministic on every run.
    const yesterday = await screen.cdp.evaluate(`(() => {
      const when = new Date();
      when.setDate(when.getDate() - 1);
      return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric" }).format(when);
    })()`)
    const present = await screen.cdp.evaluate(`document.querySelector('${DIALOG} button[aria-label="${yesterday}"]') !== null`)
    if (!present) {
      await screen.press(`${DIALOG} [aria-label="Previous month"]`, { index: 0 })
      await sleep(500)
    }
    assert(
      await screen.cdp.evaluate(`document.querySelector('${DIALOG} button[aria-label="${yesterday}"]') !== null`),
      `no day cell for ${yesterday}`,
    )
    await screen.press(`${DIALOG} button[aria-label="${yesterday}"]`, { index: 0 })

    // The one synthetic step: a native time wheel cannot be driven from CDP, so the field's
    // value goes in through the native setter and the `input` event the component reads.
    await screen.cdp.evaluate(`(() => {
      const card = document.querySelector(${JSON.stringify(DIALOG)});
      const field = card.querySelector("input[type=time]");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, "09:40");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    })()`)
    await sleep(300)
    await screen.pressText(DIALOG, "done", 900)

    await screen.until(`document.querySelector(${JSON.stringify(DIALOG)}) === null`, "the card to close on done")
    const pill = await screen.cdp.evaluate(`document.querySelector('[aria-label^="Date and time"]')?.getAttribute("aria-label")`)
    assertEqual(pill, "Date and time: Yesterday at 9:40 AM. Change", "the pill after done")

    const beforeRows = await screen.rows()
    await typeAmount(screen, ["2", "5", "0"])
    await screen.pressText(SHEET, "Add Record", 1200)
    const written = (await addedRows(screen, beforeRows))[0]
    assert(written, "the backdated row was not written")
    const clock = await screen.cdp.evaluate(`(() => {
      const when = new Date(${written.at});
      const yesterday = new Date(Date.now());
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        yesterday: when.getDate() === yesterday.getDate() && when.getMonth() === yesterday.getMonth(),
        hours: when.getHours(),
        minutes: when.getMinutes(),
      };
    })()`)
    assertEqual(JSON.stringify(clock), JSON.stringify({ yesterday: true, hours: 9, minutes: 40 }), "the moment the row carries")
  })
}

/* ------------------------------------------------------------------ *
 * Running it
 * ------------------------------------------------------------------ */

async function main() {
  const browser = findBrowser()
  if (!browser) {
    console.error("No Chrome or Chromium found. Set TRACKIT_CHROME to one, or install Chrome.")
    process.exit(2)
  }

  let server = null
  let chrome = null
  let cdp = null
  try {
    try {
      server = await ensureApp()
    } catch (error) {
      console.error(error.message)
      process.exit(2)
    }

    chrome = await launchBrowser(browser)
    cdp = await openTab(chrome.port)
    const screen = new Screen(cdp)

    console.log(`\nTrackIt flows — ${APP_URL} in ${browser.split("/").at(-1)}\n`)
    const entry = await enterApp(screen)
    // A gated build with no test account cannot run the signed-in flows. That is a "cannot
    // run", not a pass: the summary says so and the exit code is 2.
    const blocked = entry === "portal" || entry === "code"
    if (entry === "portal") await flowPortal(screen)
    else {
      await flowAddRecordSwitch(screen)
      await flowFriendsPill(screen)
      await flowDateCard(screen)
    }

    if (cdp.exceptions.length > 0) {
      results.push({ name: "the page threw nothing", ok: false, detail: cdp.exceptions.join("; ") })
    } else {
      results.push({ name: "the page threw nothing", ok: true })
      process.stdout.write("  \u001b[32m\u2713\u001b[0m the page threw nothing\n")
    }
    if (cdp.consoleErrors.length > 0) notes.push(`console errors: ${cdp.consoleErrors.join(" | ")}`)

    const failed = results.filter((result) => !result.ok)
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
    if (entry === "portal") {
      console.log(
        "\nThe signed-in flows did not run: this build gates the app and no test account was\n" +
          "given. Set TRACKIT_TEST_EMAIL and TRACKIT_TEST_PASSWORD to an account in the project\n" +
          "(with email confirmation off), or build the device-only app with VITE_CLOUD=off.",
      )
    }
    if (entry === "code") {
      console.log(
        "\nThe signed-in flows did not run: the password was accepted and the portal is waiting\n" +
          "for the six digits Supabase emails. A script cannot read an inbox — run it again with\n" +
          "TRACKIT_TEST_CODE holding the code from that email (they expire in minutes), or build\n" +
          "the device-only app with VITE_CLOUD=off.",
      )
    }
    for (const note of notes) console.log(`note: ${note}`)
    console.log(
      "\nNot covered here, on purpose: the iOS-only paths (the switch-click haptics, the platform's\n" +
        "own time wheel) need a real phone, and the dashboard's figures are `lib/derive.ts`'s business\n" +
        "rather than a gesture's — INSTRUCTIONS.md says what each change is worth checking by hand.",
    )
    process.exitCode = failed.length > 0 ? 1 : blocked ? 2 : 0
  } finally {
    cdp?.close()
    stop(chrome?.child)
    stop(server)
    if (chrome && !KEEP_PROFILE) {
      // Chrome can still be flushing its profile as it exits; a failure to tidy up a temp
      // directory is not a reason to report the checks as anything but what they were.
      try {
        rmSync(chrome.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
      } catch (error) {
        notes.push(`could not remove the temporary profile ${chrome.profile}: ${error.message}`)
      }
    }
  }
}

await main()
