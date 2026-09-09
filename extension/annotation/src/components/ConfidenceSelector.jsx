import React from 'react';
import { motion } from 'framer-motion';
import { CONFIDENCE_MAP } from '../engine/scorer';

const OPTIONS = [
  { key: 'low',    icon: '😕', ...CONFIDENCE_MAP.low,    shortcut: '1' },
  { key: 'medium', icon: '🤔', ...CONFIDENCE_MAP.medium, shortcut: '2' },
  { key: 'high',   icon: '😎', ...CONFIDENCE_MAP.high,   shortcut: '3' },
];

export default function ConfidenceSelector({ value, onChange, visible }) {
  if (!visible) return null;

  return (
    <motion.div
      className="cs-root"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="cs-label">回答的有把握嗎？</div>
      <div className="cs-options">
        {OPTIONS.map((opt) => (
          <button
            key={opt.key}
            className={`cs-btn ${value === opt.key ? 'cs-btn--active' : ''}`}
            onClick={() => onChange(opt.key)}
            type="button"
          >
            <span className="cs-icon">{opt.icon}</span>
            <span className="cs-text">{opt.label}</span>
            <span className="cs-shortcut">{opt.shortcut}</span>
          </button>
        ))}
      </div>

      <style>{`
        .cs-root {
          text-align: center;
          margin-top: 32px;
        }
        .cs-label {
          font-size: 17px;
          color: var(--text-primary);
          margin-bottom: 16px;
          font-weight: 600;
        }
        .cs-options {
          display: flex;
          justify-content: center;
          gap: 20px;
        }
        .cs-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 28px;
          background: var(--bg-card);
          border: 2px solid var(--border-light);
          border-radius: var(--radius-btn);
          font-family: var(--font-family);
          font-size: 16px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
          box-shadow: var(--shadow-card);
        }
        .cs-btn:hover {
          border-color: var(--primary-light);
          color: var(--primary-solid);
          box-shadow: var(--shadow-card-hover);
        }
        .cs-btn--active {
          border-color: var(--primary-solid);
          background: var(--primary-bg);
          color: var(--primary-solid);
          font-weight: 700;
          box-shadow: var(--shadow-selected);
        }
        .cs-icon { font-size: 22px; }
        .cs-text { font-size: 16px; }
        .cs-shortcut {
          display: inline-block;
          padding: 2px 8px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 13px;
          font-family: monospace;
          color: var(--text-muted);
        }
      `}</style>
    </motion.div>
  );
}
