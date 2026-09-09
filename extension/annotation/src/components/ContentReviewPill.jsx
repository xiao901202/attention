import React from 'react';

export default function ContentReviewPill({ vlm }) {
  if (!vlm) return null;

  const densityTag = vlm.information_density === 'High' ? 'tag-density-high' : 'tag-density-low';
  const arousalTag = vlm.emotional_arousal === 'High' ? 'tag-arousal-high'
    : vlm.emotional_arousal === 'Low' ? 'tag-arousal-low' : 'tag-arousal-neutral';

  return (
    <div className="content-pill">
      <span className="content-pill__icon">📰</span>
      <span className="content-pill__topic">{vlm.topic}</span>
      <span className={`tag ${densityTag}`}>
        {vlm.information_density === 'High' ? '高密度' : '低密度'}
      </span>
      <span className={`tag ${arousalTag}`}>
        {vlm.emotional_arousal === 'High' ? '高情緒' : vlm.emotional_arousal === 'Low' ? '低情緒' : '中性'}
      </span>

      <style>{`
        .content-pill {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 20px;
          background: var(--bg-card);
          border: 1px solid var(--border-light);
          border-radius: var(--radius-pill);
          flex-wrap: wrap;
        }
        .content-pill__icon {
          font-size: 18px;
        }
        .content-pill__topic {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
