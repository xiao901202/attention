import React from 'react';

export default function KeyboardHint({ keys }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'center', gap: 16,
      marginTop: 12, fontSize: 11, color: '#cbd5e1',
    }}>
      {keys.map((k, i) => (
        <span key={i}>
          <span className="keyboard-hint">{k.key}</span> {k.label}
        </span>
      ))}
    </div>
  );
}
