import React from 'react';

export default function OptionCard({ label, title, description, selected, onClick, shortcut }) {
  return (
    <button
      className={`option-card ${selected ? 'option-card--selected' : ''}`}
      onClick={onClick}
      type="button"
    >
      <div className="option-card__header">
        {shortcut && <span className="keyboard-hint">{shortcut}</span>}
        <span className="option-card__label">{label}</span>
      </div>
      <div className="option-card__title">{title}</div>
      <div className="option-card__desc">{description}</div>

      <style>{`
        .option-card {
          display: block;
          width: 100%;
          text-align: left;
          padding: 28px 24px;
          background: var(--bg-card);
          border: 2px solid var(--border-light);
          border-radius: var(--radius-card);
          cursor: pointer;
          transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
          font-family: var(--font-family);
        }
        .option-card:hover {
          border-color: #c7d2fe;
          box-shadow: var(--shadow-card-hover);
        }
        .option-card--selected {
          border-color: var(--border-selected);
          box-shadow: var(--shadow-selected);
          transform: scale(1.01);
        }
        .option-card__header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }
        .option-card__label {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
        }
        .option-card__title {
          font-size: 20px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 8px;
          line-height: 1.4;
        }
        .option-card__desc {
          font-size: 15px;
          color: var(--text-secondary);
          line-height: 1.6;
        }
      `}</style>
    </button>
  );
}
