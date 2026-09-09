import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import ProgressBar from '../components/ProgressBar';
import ContentReviewPill from '../components/ContentReviewPill';
import SegmentVideoPlayer from '../components/SegmentVideoPlayer';
import KeyboardHint from '../components/KeyboardHint';
import { CONFIDENCE_MAP } from '../engine/scorer';

const CONF_OPTIONS = [
  { level: 'low', label: '沒把握', emoji: '🤔', key: '1' },
  { level: 'medium', label: '普通', emoji: '😐', key: '2' },
  { level: 'high', label: '有把握', emoji: '😎', key: '3' },
];

export default function Step1Agency({
  survey, currentVlm, currentSegment, videoBlob, totalSteps,
  onComplete, onBack,
}) {
  const [selected, setSelected] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [reframed, setReframed] = useState(false);

  const question = reframed ? survey?.step1_reframe : survey?.step1_question;
  const options = survey?.step1_options;

  const canProceed = selected !== null && confidence !== null;

  const handleNext = useCallback(() => {
    if (selected === null || confidence === null) return;
    const conf = CONFIDENCE_MAP[confidence];
    console.log('[Step1] submit:', { selected, confidence, confObj: conf });
    onComplete(options[selected], conf);
  }, [selected, confidence, options, onComplete]);

  useEffect(() => {
    if (selected !== null && confidence !== null) {
      const t = setTimeout(() => handleNext(), 250);
      return () => clearTimeout(t);
    }
  }, [selected, confidence, handleNext]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'a' || e.key === 'A') { setSelected('A'); setConfidence(null); }
      else if (e.key === 'b' || e.key === 'B') { setSelected('B'); setConfidence(null); }
      else if (e.key === '1') setConfidence('low');
      else if (e.key === '2') setConfidence('medium');
      else if (e.key === '3') setConfidence('high');
      else if (e.key === 'Backspace') { e.preventDefault(); onBack(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <motion.div
      className="step-col"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
    >
      <ProgressBar current={1} total={totalSteps} label={`標註進度 1/${totalSteps}`} />

      {/* Step 1: full video */}
      <SegmentVideoPlayer videoBlob={videoBlob} segment={currentSegment} />

      <ContentReviewPill vlm={currentVlm} />

      {/* Main card */}
      <div className="main-card" style={{ marginTop: 12 }}>
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--primary-solid)', fontWeight: 600 }}>
            第一題 · 主控感
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

        {/* Options: two large cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {options && ['A', 'B'].map(key => {
            const opt = options[key];
            const isSel = selected === key;
            return (
              <button key={key} onClick={() => { setSelected(key); setConfidence(null); }} style={{
                background: isSel ? 'rgba(99,102,241,0.04)' : 'white',
                border: `2px solid ${isSel ? '#6366f1' : '#e2e8f0'}`,
                borderRadius: 16, padding: '20px 18px', textAlign: 'left',
                cursor: 'pointer', transition: 'all 0.2s',
                transform: isSel ? 'scale(1.02)' : 'scale(1)',
                boxShadow: isSel ? '0 4px 16px rgba(99,102,241,0.12)' : '0 1px 3px rgba(0,0,0,0.03)',
                fontFamily: 'var(--font-family)',
              }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>選項 {key}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: isSel ? '#6366f1' : '#334155', marginBottom: 6 }}>
                  {opt.title}
                </div>
                <div style={{ fontSize: 13, color: isSel ? '#475569' : '#94a3b8', lineHeight: 1.6 }}>
                  {opt.description}
                </div>
              </button>
            );
          })}
        </div>

        {/* Confidence (gated on having selected an option) */}
        <div style={{
          borderTop: '1px solid #f1f5f9', paddingTop: 16, marginBottom: 12,
          opacity: selected ? 1 : 0.35,
          pointerEvents: selected ? 'auto' : 'none',
          transition: 'opacity 0.3s',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 10 }}>
              回答的有把握嗎？
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
              {CONF_OPTIONS.map(c => {
                const isSel = confidence === c.level;
                return (
                  <button key={c.level} onClick={() => setConfidence(c.level)} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 18px', borderRadius: 12,
                    background: isSel ? 'rgba(99,102,241,0.08)' : 'white',
                    border: `1.5px solid ${isSel ? '#6366f1' : '#e2e8f0'}`,
                    cursor: 'pointer', transition: 'all 0.15s',
                    fontSize: 14, fontWeight: isSel ? 700 : 500,
                    color: isSel ? '#6366f1' : '#64748b',
                    fontFamily: 'var(--font-family)',
                  }}>
                    <span style={{ fontSize: 16 }}>{c.emoji}</span>
                    {c.label}
                    <span style={{ fontSize: 10, color: '#cbd5e1', marginLeft: 2 }}>{c.key}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Nav — back is always usable, next gated on canProceed */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-primary" onClick={onBack} style={{ flex: 1 }}>← 回前一題</button>
          <button className="btn-outline" onClick={handleNext} disabled={!canProceed} style={{ flex: 1 }}>
            下一題 →
          </button>
        </div>
      </div>

      <KeyboardHint keys={[
        { key: 'A/B', label: '選項' }, { key: '1/2/3', label: '把握度' },
        { key: 'Enter', label: '下一題' }, { key: '⌫', label: '回前一題' },
      ]} />
    </motion.div>
  );
}
