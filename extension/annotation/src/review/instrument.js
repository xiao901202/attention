// Fixed review draft: research/reports/2026-09-09-progress-plan.md, slides 20 and 22.
// This is not an approved instrument; earlier answer snapshots keep their original version.
//
// 2026-09-22: the scale was briefly changed to 5 points (draft-20260922.1) and
// reverted to 7 on 2026-09-23. Both source scales are 7-point — Mishra et al.
// (1993) is a 7-point semantic differential and the MSLQ is a 7-point Likert —
// so 7 keeps the adaptation to wording and framing only. No answers were
// recorded at 5 points, so this returns to the same instrument rather than
// becoming a third version, and its hash returns to the original value.
// scale_points is the single source for the rendered scale and for answer
// validation, so the declared and displayed scales cannot drift apart.
export const UI_VERSION = 'review-ui-20260923.1';
export const INSTRUMENT = {
  id: 'attention-encounter-review',
  version: 'draft-20260909.2',
  status: 'review_draft',
  eligible_for_primary_analysis: false,
  scale_points: 7,
  x_prompt: '請回想在閱讀這則貼文之前，你對這個主題的了解程度。',
  y_prompt: '請根據剛才實際瀏覽這則貼文時的情況回答，不要根據現在重看後才想到的內容回答。',
  items: [
    { id: 'X08', construct: 'subjective_prior_knowledge', text: '對這個主題，我的了解程度', low: '了解得很少', high: '了解得很多', source: 'Mishra et al., 1993', source_item: 'x8' },
    { id: 'X09', construct: 'subjective_prior_knowledge', text: '對這個主題，我的相關經驗', low: '沒有經驗', high: '很有經驗', source: 'Mishra et al., 1993', source_item: 'x9' },
    { id: 'X10', construct: 'subjective_prior_knowledge', text: '對這個主題相關資訊的掌握程度', low: '掌握得很少', high: '掌握得很多', source: 'Mishra et al., 1993', source_item: 'x10' },
    { id: 'X11', construct: 'subjective_prior_knowledge', text: '對這個主題，我的專業程度', low: '新手', high: '內行', source: 'Mishra et al., 1993', source_item: 'x11' },
    { id: 'Y53', construct: 'encounter_elaboration', text: '閱讀這則貼文時，我有把不同來源（例如其他文章、討論）的資訊整合起來。', low: '完全不符合', high: '完全符合', source: 'Pintrich et al., 1991 / MSLQ', source_item: '53' },
    { id: 'Y62', construct: 'encounter_elaboration', text: '閱讀這則貼文時，我有試著將其中的想法與其他主題的想法連結起來。', low: '完全不符合', high: '完全符合', source: 'Pintrich et al., 1991 / MSLQ', source_item: '62' },
    { id: 'Y64', construct: 'encounter_elaboration', text: '閱讀這則貼文時，我有試著把內容與我原本知道的事情連結起來。', low: '完全不符合', high: '完全符合', source: 'Pintrich et al., 1991 / MSLQ', source_item: '64' },
    { id: 'Y69', construct: 'encounter_elaboration', text: '閱讀這則貼文時，我有透過連結貼文內容與相關概念，來理解它的意思。', low: '完全不符合', high: '完全符合', source: 'Pintrich et al., 1991 / MSLQ', source_item: '69' },
  ],
};

export const MISSING_REASONS = {
  cannot_recall: '無法回想',
  not_applicable: '不適用',
  prefer_not_to_answer: '不想回答',
};

export async function instrumentSnapshot() {
  const bytes = new TextEncoder().encode(JSON.stringify(INSTRUMENT));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return { ...INSTRUMENT, sha256: [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('') };
}
