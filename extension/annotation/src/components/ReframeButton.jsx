import React from 'react';

export default function ReframeButton({ onClick, active }) {
  return (
    <button
      className={`reframe-btn ${active ? 'reframe-btn--active' : ''}`}
      onClick={onClick}
      type="button"
    >
      {active ? '回到原本的問法' : '這題不好選嗎？換個角度試試'}

      <style>{`
        .reframe-btn {
          display: block;
          margin: 12px auto;
          padding: 8px 20px;
          background: transparent;
          border: 1px solid var(--border-light);
          border-radius: var(--radius-pill);
          font-family: var(--font-family);
          font-size: 15px;
          color: var(--primary-solid);
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .reframe-btn:hover {
          background: var(--primary-bg);
          border-color: var(--primary-solid);
        }
        .reframe-btn--active {
          background: var(--primary-bg);
          border-color: var(--primary-solid);
        }
      `}</style>
    </button>
  );
}
