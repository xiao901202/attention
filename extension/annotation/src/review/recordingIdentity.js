export function recordingLabel(id) {
  const value = String(id || 'unknown');
  // Production recorder IDs are epoch milliseconds, not the review-open time.
  if (/^\d{13}$/.test(value)) return new Date(Number(value)).toLocaleString('zh-TW', { hour12: false });
  return `編號 ${value}`;
}

export function reviewFilename(session) {
  const id = String(session.recording_id || session.session_id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  const version = String(session.instrument?.version || 'unknown').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return `review_${id}_${version}.json`;
}
