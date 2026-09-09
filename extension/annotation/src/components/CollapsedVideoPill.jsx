import React from 'react';

export default function CollapsedVideoPill({ vlm, onClick }) {
  const densityTag = vlm?.information_density === 'High' ? 'tag-density-high' : 'tag-density-low';
  const arousalTag = vlm?.emotional_arousal === 'High' ? 'tag-arousal-high'
    : vlm?.emotional_arousal === 'Low' ? 'tag-arousal-low' : 'tag-arousal-neutral';

  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 16px', marginBottom: 12,
      background: 'white', border: '1px solid #e2e8f0', borderRadius: 12,
      cursor: 'pointer', transition: 'all 0.2s',
      fontFamily: 'var(--font-family)',
    }}>
      <div style={{
        width: 40, height: 28, borderRadius: 6, background: '#1a1a2e',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, color: 'rgba(255,255,255,0.5)', flexShrink: 0,
      }}>▶</div>
      <div style={{ flex: 1, textAlign: 'left' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
          {vlm?.topic || '內容回顧'}
        </span>
        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>點擊重看影片</span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <span className={`tag ${densityTag}`}>
          {vlm?.information_density === 'High' ? '高密度' : '低密度'}
        </span>
        <span className={`tag ${arousalTag}`}>
          {vlm?.emotional_arousal === 'High' ? '高情緒' : vlm?.emotional_arousal === 'Low' ? '低情緒' : '中性'}
        </span>
      </div>
    </button>
  );
}
