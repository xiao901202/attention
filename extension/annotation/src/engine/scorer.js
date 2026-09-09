export function getQuadrant(x, y) {
  if (x > 0 && y > 0)  return 'Q1';
  if (x > 0 && y <= 0) return 'Q2';
  if (x <= 0 && y > 0) return 'Q3';
  return 'Q4';
}

export const QUADRANT_NAMES = {
  Q1: { name: '深度心流', en: 'Deep Flow', emoji: '🔥' },
  Q2: { name: '主動休憩', en: 'Restorative', emoji: '🌿' },
  Q3: { name: '兔子洞', en: 'Rabbit Hole', emoji: '🕳️' },
  Q4: { name: '殭屍滑動', en: 'Doomscrolling', emoji: '🧟' },
};

export const CONFIDENCE_MAP = {
  low:    { label: '沒把握', weight: 0.3 },
  medium: { label: '普通',   weight: 0.6 },
  high:   { label: '有把握', weight: 1.0 },
};

function safeWeight(conf) {
  if (conf && typeof conf.weight === 'number') return conf.weight;
  console.warn('[Scorer] invalid confidence object:', conf);
  return 0.6;
}

export function computeAnnotation(step1, step2, step3, policy) {
  const x = step1.option.baseScore;
  const y = step2.option.baseScore;
  const quadrant = getQuadrant(x, y);

  const w1 = safeWeight(step1.confidence);
  const w2 = safeWeight(step2.confidence);
  const baseWeight = (w1 + w2) / 2;

  let consistencyBonus = 0;
  let isConsistent = null;
  let step3Quadrant = null;

  if (policy.showStep3 && step3) {
    step3Quadrant = step3.option.quadrant;
    isConsistent = (quadrant === step3Quadrant);
    consistencyBonus = isConsistent ? +0.20 : -0.15;
  }

  const finalWeight = Math.max(0.1, Math.min(1.2, baseWeight + consistencyBonus));

  console.log('[Scorer] DETAIL:', {
    x, y, quadrant,
    step1_conf_raw: step1.confidence,
    step2_conf_raw: step2.confidence,
    w1, w2, baseWeight,
    step3Quadrant, isConsistent, consistencyBonus,
    finalWeight,
  });

  return {
    label: { x_coordinate: x, y_coordinate: y, computed_quadrant: quadrant },
    weight: {
      confidence_x: w1,
      confidence_y: w2,
      confidence_avg: baseWeight,
      consistency_bonus: consistencyBonus,
      final_sample_weight: finalWeight,
    },
    step3_diagnostic: {
      was_shown: policy.showStep3 && step3 !== null,
      phase: policy.phase,
      self_reported_quadrant: step3Quadrant,
      is_consistent: isConsistent,
    },
  };
}
