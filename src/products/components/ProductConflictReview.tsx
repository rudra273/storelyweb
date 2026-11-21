/** Explicit review before advancing the saved product version; no automatic overwrite. */
export function ProductConflictReview({ rows, onApply, incompatible = false }: {
  rows: { label: string; current: string | boolean; mine: string | boolean }[]
  onApply: () => void
  incompatible?: boolean
}) {
  return <section aria-label="Latest product review">
    <p>Your entered changes are kept. Review them against the latest product. Other changes from the latest product will be kept.</p>
    <div className="table-wrap"><table className="table"><thead><tr><th>Field</th><th>Latest value</th><th>Your value</th></tr></thead><tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{String(row.current)}</td><td>{String(row.mine)}</td></tr>)}</tbody></table></div>
    {incompatible ? <p>Pricing or stock tracking changed. Keep these values for reference, cancel inline editing, and use the full product editor to review those settings.</p> : <button type="button" onClick={onApply}>Keep my edits with latest product</button>}
  </section>
}
