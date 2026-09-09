import React from 'react';
import { motion } from 'framer-motion';
import ContentReviewPill from '../components/ContentReviewPill';
import SegmentVideoPlayer from '../components/SegmentVideoPlayer';

const STATE_COLORS = {
  READING_FLOW: '#22c55e',
  SCANNING_ZOMBIE: '#ef4444',
  NAVIGATING: '#f59e0b',
  IDLE: '#94a3b8',
};

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function Step0Trigger({
  currentVlm, currentSegment, currentSegIdx, readingIndices,
  step3Policy, totalSteps, videoBlob,
  segments, duration,
  onStart,
}) {
  const segNum = currentSegIdx + 1;
  const segTotal = readingIndices.length;
  const currentSegGlobalIdx = readingIndices[currentSegIdx];

  return (
    <motion.div
      className="step-col"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      style={{ textAlign: 'center' }}
    >
      {/* Timeline + count — shown at the top */}
      {segments && duration > 0 && (
        <div style={{
          background: 'var(--surface-raised, #f8fafc)',
          border: '1px solid var(--border-light, #e2e8f0)',
          borderRadius: 8, padding: '10px 12px', marginBottom: 16, textAlign: 'left',
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
            📊 時間軸 &nbsp;·&nbsp;
            <strong style={{ color: 'var(--text-primary, #1e293b)' }}>{segTotal}</strong>
            &nbsp;個閱讀片段需標註，目前第 <strong style={{ color: 'var(--text-primary, #1e293b)' }}>{segNum}</strong> 個
          </div>
          <div style={{
            position: 'relative', height: 16,
            background: '#e2e8f0', borderRadius: 4, overflow: 'hidden',
          }}>
            {segments.map((seg, i) => {
              const left = (seg.startTime / duration) * 100;
              const width = Math.max(((seg.endTime - seg.startTime) / duration) * 100, 0.3);
              const isCurrent = i === currentSegGlobalIdx;
              return (
                <div key={i} style={{
                  position: 'absolute', left: `${left}%`, width: `${width}%`, height: '100%',
                  background: STATE_COLORS[seg.state] || '#ccc',
                  zIndex: isCurrent ? 2 : 1,
                  outline: isCurrent ? '2px solid #1e293b' : 'none',
                  outlineOffset: '-1px',
                }} />
              );
            })}
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 11, color: 'var(--text-muted)', marginTop: 3,
          }}>
            <span>00:00</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 56 }} className="mascot-bounce">🦉</span>
      </div>

      <div className="main-card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>偵測到你停下來閱讀了</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          花 {totalSteps * 3} 秒回答 {totalSteps} 個問題
        </p>
      </div>

      <SegmentVideoPlayer videoBlob={videoBlob} segment={currentSegment} />

      <div style={{ marginBottom: 16 }}>
        <ContentReviewPill vlm={currentVlm} />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button className="btn-primary" onClick={onStart} style={{ minWidth: 160 }}>
          開始標註
        </button>
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
        片段 {segNum} / {segTotal} · Phase {step3Policy.phase}
      </div>
    </motion.div>
  );
}
