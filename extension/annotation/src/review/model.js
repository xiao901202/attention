import { INSTRUMENT, UI_VERSION } from './instrument';

export function candidateIndices(segments) {
  return segments.flatMap((s, i) => s.state === 'READING_FLOW'
    && Number.isFinite(s.startTime) && Number.isFinite(s.endTime)
    && s.startTime >= 0 && s.endTime - s.startTime >= 2000 ? [i] : []);
}

export function emptyDraft() {
  return { activity: null, recall: null, answers: {}, media_events: [] };
}

export function createReview(source, instrument) {
  return {
    schema_version: 2,
    kind: 'fixed-self-report-review',
    session_id: `review:${source.recordingId}:${instrument.version}`,
    recording_id: source.recordingId,
    collection_mode: source.demo ? 'interface_demo' : 'instrument_review',
    eligible_for_primary_analysis: false,
    ui_version: UI_VERSION,
    instrument,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    revision: 0,
    segments: source.segments,
    scrollData: source.scrollData || [],
    mouseData: source.mouseData || [],
    postTracking: source.postTracking || null,
    cropRect: source.cropRect || null,
    duration: source.duration,
    sampling: { method: 'legacy_reading_candidate', minimum_segment_ms: 2000, includes_non_candidates: false },
    candidates: candidateIndices(source.segments),
    cursor: { stage: 'intro', segment: 0, item: 0 },
    drafts: {},
    annotations: {},
  };
}

export function isAnswer(answer) {
  return !!answer && ((Number.isInteger(answer.value) && answer.value >= 1 && answer.value <= INSTRUMENT.scale_points && answer.missing_reason === null)
    || (answer.value === null && ['cannot_recall', 'not_applicable', 'prefer_not_to_answer'].includes(answer.missing_reason)));
}

export function canSubmit(draft) {
  return draft?.activity === 'reading' && draft.recall === 'yes'
    && INSTRUMENT.items.every(item => isAnswer(draft.answers[item.id]));
}

export function withAnswer(draft, itemId, value, missingReason = null) {
  if (!INSTRUMENT.items.some(item => item.id === itemId)) throw new Error('Unknown item');
  const answer = { value, missing_reason: missingReason, answered_at: new Date().toISOString() };
  if (!isAnswer(answer)) throw new Error('Invalid answer');
  return { ...draft, answers: { ...draft.answers, [itemId]: answer } };
}

export function completeSegment(session, outcome, reason = null) {
  const index = session.candidates[session.cursor.segment];
  const draft = session.drafts[index] || emptyDraft();
  if (outcome === 'answered' && !canSubmit(draft)) throw new Error('請先完成本段確認與所有題目。');
  if (!['answered', 'skipped'].includes(outcome) || (outcome === 'skipped' && !reason)) throw new Error('請選擇略過原因。');
  const annotation = {
    annotation_id: `${session.session_id}:${index}`,
    segment_index: index,
    segment: { startTime: session.segments[index].startTime, endTime: session.segments[index].endTime },
    instrument_version: session.instrument.version,
    instrument_sha256: session.instrument.sha256,
    outcome,
    reason,
    activity: draft.activity,
    recall: draft.recall,
    // Partial answers remain only in drafts; skipped encounters never become scale scores.
    item_answers: outcome === 'answered' ? draft.answers : {},
    media_events: draft.media_events,
    updated_at: new Date().toISOString(),
  };
  // Persist the annotation and its next position together; the hook reveals this
  // position only after transaction completion, including when a save is retried.
  return nextSegment({ ...session, annotations: { ...session.annotations, [index]: annotation } });
}

export function nextSegment(session) {
  const next = session.cursor.segment + 1;
  return { ...session, cursor: next < session.candidates.length
    ? { stage: 'gate', segment: next, item: 0 }
    : { ...session.cursor, stage: 'done' } };
}

// A permalink names the account that authored the post, which is a third party
// who never consented to this study. The reviewer's own copy keeps it so they
// can reopen their post; the export is where data leaves the machine, so the
// raw URL is dropped there. The salted fingerprint in `id` still identifies the
// post across encounters and sessions.
function redactPermalinks(postTracking) {
  if (!postTracking?.posts) return postTracking || null;
  const posts = Object.fromEntries(Object.entries(postTracking.posts)
    .map(([key, post]) => [key, { ...post, permalink: null }]));
  return { ...postTracking, posts };
}

export function exportReview(session) {
  return { ...session, postTracking: redactPermalinks(session.postTracking),
    exported_at: new Date().toISOString(), media_included: false,
    permalinks_redacted: true, legacy_quadrant_scoring_applied: false };
}
