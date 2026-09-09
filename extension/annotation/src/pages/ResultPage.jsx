import React from 'react';
import { motion } from 'framer-motion';
import { QUADRANT_NAMES } from '../engine/scorer';

export default function ResultPage({
  annotationResult, currentSegIdx, readingIndices,
  onNext, onOverview,
}) {
  if (!annotationResult) return null;

  const { label, weight, step3_diagnostic } = annotationResult;
  const q = QUADRANT_NAMES[label.computed_quadrant];
  const hasMore = currentSegIdx + 1 < readingIndices.length;

  return (
    <motion.div
      className="step-col"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      style={{ textAlign: 'center' }}
    >
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 48 }}>😊</span>
        <h2 style={{ fontSize: 20, marginTop: 6 }}>標註完成</h2>
      </div>

      <div className="main-card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 40, marginBottom: 4 }}>{q?.emoji}</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{q?.name}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{q?.en}</div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <div style={{ flex: 1, background: '#f8fafc', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>X 主控感</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: label.x_coordinate > 0 ? 'var(--success)' : 'var(--danger)' }}>
              {label.x_coordinate > 0 ? '+1' : '-1'}
            </div>
          </div>
          <div style={{ flex: 1, background: '#f8fafc', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Y 認知</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: label.y_coordinate > 0 ? 'var(--success)' : 'var(--danger)' }}>
              {label.y_coordinate > 0 ? '+1' : '-1'}
            </div>
          </div>
          <div style={{ flex: 1, background: '#f8fafc', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>權重</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary-solid)' }}>
              {weight.final_sample_weight.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Weight detail */}
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 10, fontSize: 12, color: '#64748b', textAlign: 'left' }}>
          <strong>權重明細：</strong>
          Step1={weight.confidence_x} · Step2={weight.confidence_y} · avg={weight.confidence_avg.toFixed(2)}
          {step3_diagnostic.was_shown && (
            <span>
              {' '}· Step3 {step3_diagnostic.self_reported_quadrant} vs {label.computed_quadrant}
              {step3_diagnostic.is_consistent ? ' ✓+0.20' : ' ✗-0.15'}
            </span>
          )}
          {' '}→ <strong>{weight.final_sample_weight.toFixed(2)}</strong>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        {hasMore ? (
          <button className="btn-primary" onClick={onNext} style={{ minWidth: 200 }}>
            標註下一段 →
          </button>
        ) : (
          <button className="btn-primary" onClick={onOverview} style={{ minWidth: 200 }}>
            查看總覽
          </button>
        )}
      </div>
    </motion.div>
  );
}
