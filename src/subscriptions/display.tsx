const LABELS: Record<string, string> = {
  active: 'Active', free: 'Free', expired: 'Expired', suspended: 'Suspended', scheduled: 'Starts soon',
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected', activated: 'Activated', unavailable: 'Unavailable',
}

export function Status({ value }: { value: string }) {
  return <span className={`badge status-${value}`}>{LABELS[value] ?? value.replace(/_/g, ' ')}</span>
}
