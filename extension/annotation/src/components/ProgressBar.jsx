import React from 'react';

export default function ProgressBar({ current, total, label }) {
  const pct = total > 0 ? (current / total) * 100 : 0;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 16,
    }}>
      <div style={{ flex: 1, height: 4, background: '#dde3ea', borderRadius: 2, marginRight: 12 }}>
        <div style={{
          height: '100%', borderRadius: 2,
          background: 'linear-gradient(90deg, #6366f1, #818cf8)',
          width: `${pct}%`, transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>
        {label || `${current}/${total}`}
      </span>
    </div>
  );
}
