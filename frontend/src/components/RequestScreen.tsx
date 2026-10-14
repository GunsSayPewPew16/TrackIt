import { useEffect } from 'react'

/**
 * Request — a page that exists so the button on Home has somewhere to go.
 *
 * The owner asked for a blank screen here for now, and blank is the honest
 * shape for it: asking someone for money is not designed yet, and the two
 * things that could go here instead — a form that does nothing, or a button
 * that silently ignores a tap — would both be worse than a page that says so.
 * It carries the same back arrow as every other page, which is the only thing
 * on it that does anything.
 */

type Props = {
  onClose: () => void
}

export function RequestScreen({ onClose }: Props) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <section className="page-overlay is-open" aria-label="Request">
      <div className="ops-header">
        <button
          type="button"
          className="icon-btn icon-btn--round"
          title="Back"
          aria-label="Close Request"
          onClick={onClose}
        >
          <svg
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
        </button>
      </div>

      <h1 className="screen-title">Request</h1>

      <div className="empty-state">
        <p className="empty-state__title">Nothing here yet</p>
        <p className="empty-state__note">
          Requesting money is not built. This page is a placeholder, so the
          button that opens it has somewhere to go.
        </p>
      </div>
    </section>
  )
}
