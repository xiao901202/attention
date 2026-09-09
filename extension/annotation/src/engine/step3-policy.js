const STORAGE_KEY = 'attentionQuadrant_step3Policy';

const DEFAULTS = {
  annotation_count: 0,
  consistent_count: 0,
  phase: 1,
};

async function loadState() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return { ...DEFAULTS, ...(data[STORAGE_KEY] || {}) };
  } catch {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  }
}

async function saveState(state) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

export async function getStep3Policy() {
  const state = await loadState();
  // Phase 1: always show Step 3 (calibration)
  // Phase 2/3: reserved for future sampling/retirement
  return {
    showStep3: state.phase === 1,
    phase: state.phase,
    annotationCount: state.annotation_count,
    consistencyRate: state.annotation_count > 0
      ? state.consistent_count / state.annotation_count
      : 0,
  };
}

export async function recordAnnotation(isConsistent) {
  const state = await loadState();
  state.annotation_count += 1;
  if (isConsistent) state.consistent_count += 1;
  await saveState(state);
}
