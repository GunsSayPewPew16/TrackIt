/**
 * Cards is deliberately blank: the rail's fourth tab is wired, and the reference
 * puts a wallet there, but nothing has been designed to sit behind it yet. The
 * placeholder says so out loud rather than showing an empty screen that reads as
 * broken — the same choice the mockup makes.
 */
export function CardsScreen() {
  return (
    <section className="screen">
      <div className="placeholder">
        <span className="placeholder__title">Cards</span>
        <span className="placeholder__note">Blank screen</span>
      </div>
    </section>
  )
}
