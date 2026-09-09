import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import ProgressBar from '../components/ProgressBar';
import SegmentVideoPlayer from '../components/SegmentVideoPlayer';
import CollapsedVideoPill from '../components/CollapsedVideoPill';
import KeyboardHint from '../components/KeyboardHint';

const PILL_COLORS = { A: '#22c55e', B: '#06b6d4', C: '#f97316', D: '#94a3b8' };

const KEY_MAP = { A: 'A', B: 'B', C: 'C', D: 'D' };

export default function Step3Verify({
  survey, currentVlm, currentSegment, videoBlob, totalSteps,
  onComplete, onBack,
}) {
  const [selected, setSelected] = useState(null);
  const [reframed, setReframed] = useState(false);
  const [videoExpanded, setVideoExpanded] = useState(false);

  const question = reframed ? survey?.step3_reframe : survey?.step3_question;
  const options = survey?.step3_options;
  const optionKeys = options ? Object.keys(options) : [];

  const canProceed = selected !== null;

  const handleNext = useCallback(() => {
    if (selected === null) return;
    console.log('[Step3] submit:', { selected });
    onComplete(options[selected], null);
  }, [selected, options, onComplete]);

  useEffect(() => {
    function onKey(e) {
      const key = e.key.toUpperCase();
      if (KEY_MAP[key] && options?.[key]) { setSelected(key); }
      else if (e.key === 'Enter') { e.preventDefault(); handleNext(); }
      else if (e.key === 'Backspace') { e.preventDefault(); onBack(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, options, handleNext]);

  const selectedOpt = selected && options ? options[selected] : null;

  return (
    <motion.div
      className="step-col"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
    >
      <ProgressBar current={3} total={totalSteps} label={`標註進度 3/${totalSteps}`} />

      {/* Step 3: collapsed video pill */}
      {videoExpanded ? (
        <div>
          <SegmentVideoPlayer videoBlob={videoBlob} segment={currentSegment} />
          <button onClick={() => setVideoExpanded(false)} style={{
            display: 'block', margin: '0 auto 12px', background: 'none', border: 'none',
            fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-family)',
          }}>收合影片 ▲</button>
        </div>
      ) : (
        <CollapsedVideoPill vlm={currentVlm} onClick={() => setVideoExpanded(true)} />
      )}

      {/* Step 3 warning */}
      <div style={{
        background: '#fefce8', border: '1px solid #fde68a', borderRadius: 10,
        padding: '8px 14px', marginBottom: 12, fontSize: 12, color: '#92400e',
      }}>
        ⚖️ 品質驗證題 — 答案不影響標籤，僅調整訓練權重
      </div>

      {/* Main card */}
      <div className="main-card">
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--primary-solid)', fontWeight: 600 }}>
            第三題 · 感受驗證
          </span>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', lineHeight: 1.6, margin: '8px 0 4px' }}>
          {question}
        </h2>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <button onClick={() => setReframed(!reframed)} style={{
            background: 'none', border: '1px solid var(--border-light)', borderRadius: 20,
            padding: '4px 16px', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer',
            fontFamily: 'var(--font-family)',
          }}>
            {reframed ? '看原本的問法' : '這題不好選嗎？換個角度試試'}
          </button>
        </div>

        {/* Options: 1×4 horizontal pills */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: selectedOpt ? 12 : 0 }}>
            {optionKeys.map(k => {
              const opt = options[k];
              const isSel = selected === k;
              const c = PILL_COLORS[k] || '#6366f1';
              return (
                <button key={k} onClick={() => setSelected(k)} style={{
                  padding: '14px 8px', borderRadius: 14, textAlign: 'center',
                  background: isSel ? `${c}10` : 'white',
                  border: `2px solid ${isSel ? c : '#e2e8f0'}`,
                  cursor: 'pointer', transition: 'all 0.2s',
                  transform: isSel ? 'scale(1.03)' : 'scale(1)',
                  fontFamily: 'var(--font-family)',
                }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>{k}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: isSel ? c : '#334155' }}>{opt.title}</div>
                </button>
              );
            })}
          </div>
          {/* Expanded description */}
          {selectedOpt && (
            <div style={{
              background: `${PILL_COLORS[selected] || '#6366f1'}08`,
              border: `1px solid ${PILL_COLORS[selected] || '#6366f1'}20`,
              borderRadius: 12, padding: '12px 16px',
              fontSize: 13, color: '#475569', lineHeight: 1.6,
              animation: 'fadeIn 0.2s ease',
            }}>
              <span style={{ fontWeight: 600, color: PILL_COLORS[selected] || '#6366f1' }}>{selectedOpt.title}</span>
              ：{selectedOpt.description}
            </div>
          )}
        </div>

        {/* Nav */}
        <div style={{
          borderTop: '1px solid #f1f5f9', paddingTop: 16,
        }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-primary" onClick={onBack} style={{ flex: 1 }}>← 回前一題</button>
            <button className="btn-outline" onClick={handleNext} disabled={!canProceed} style={{ flex: 1 }}>
              查看結果 →
            </button>
          </div>
        </div>
      </div>

      <KeyboardHint keys={[
        { key: 'A/B/C/D', label: '選項' },
        { key: 'Enter', label: '查看結果' }, { key: '⌫', label: '回前一題' },
      ]} />
    </motion.div>
  );
}
