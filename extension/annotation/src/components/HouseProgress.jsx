import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function ramp(p, a, b) { return clamp01((p - a) / (b - a)); }

// ============================================
// Theme definitions — each theme supplies layer renderers
// that animate based on the shared progress ramps.
// ============================================

function defaultSmoke() {
  return (
    <g>
      <motion.circle cx="134" cy="56" r="3" fill="#e5e7eb"
        animate={{ cy: [56, 38, 36], cx: [134, 138, 140], opacity: [0.7, 0.4, 0] }}
        transition={{ duration: 2.4, repeat: Infinity }} />
      <motion.circle cx="136" cy="50" r="4" fill="#e5e7eb"
        animate={{ cy: [50, 30, 26], cx: [136, 142, 146], opacity: [0.6, 0.3, 0] }}
        transition={{ duration: 2.8, repeat: Infinity, delay: 0.6 }} />
      <motion.circle cx="138" cy="46" r="5" fill="#e5e7eb"
        animate={{ cy: [46, 22, 16], cx: [138, 146, 152], opacity: [0.5, 0.2, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, delay: 1.2 }} />
    </g>
  );
}

// ---------- Theme 1: 經典小屋 ----------
const themeClassic = {
  id: 'classic',
  name: '經典小屋',
  skyFrom: '#e0f2fe',
  skyTo: '#fef3c7',
  groundColor: '#86efac',
  groundLineColor: '#4ade80',
  sunColor: '#fbbf24',
  sunRayColor: '#f59e0b',
  render: (p, full) => {
    const wallH = 55 * ramp(p, 0.08, 0.48);
    const wallY = 148 - wallH;
    const openingOpacity = ramp(p, 0.42, 0.6);
    const roofP = ramp(p, 0.58, 0.82);
    const chimneyP = ramp(p, 0.82, 0.95);
    const decorP = ramp(p, 0.95, 1);
    return (
      <>
        <motion.rect x="38" y="148" width="124" height="8" fill="#6b7280" rx="1"
          animate={{ opacity: p > 0 ? 1 : 0.35 }} />

        <motion.rect x="52" width="96" fill="#fcd34d" stroke="#a16207" strokeWidth="1.5"
          animate={{ y: wallY, height: wallH }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }} />

        <motion.g animate={{ opacity: openingOpacity }}>
          <rect x="91" y="122" width="18" height="26" fill="#78350f" rx="1" stroke="#451a03" strokeWidth="1" />
          <circle cx="104" cy="136" r="1.4" fill="#fbbf24" />

          <rect x="60" y="114" width="18" height="16" fill={full ? '#fef3c7' : '#93c5fd'} stroke="#1e3a8a" strokeWidth="1" />
          <line x1="69" y1="114" x2="69" y2="130" stroke="#1e3a8a" strokeWidth="0.8" />
          <line x1="60" y1="122" x2="78" y2="122" stroke="#1e3a8a" strokeWidth="0.8" />

          <rect x="122" y="114" width="18" height="16" fill={full ? '#fef3c7' : '#93c5fd'} stroke="#1e3a8a" strokeWidth="1" />
          <line x1="131" y1="114" x2="131" y2="130" stroke="#1e3a8a" strokeWidth="0.8" />
          <line x1="122" y1="122" x2="140" y2="122" stroke="#1e3a8a" strokeWidth="0.8" />
        </motion.g>

        <motion.polygon points="42,95 100,58 158,95" fill="#dc2626" stroke="#7f1d1d" strokeWidth="1.5"
          style={{ transformOrigin: '100px 95px' }}
          animate={{ opacity: roofP, scaleY: roofP }} />

        <motion.g animate={{ opacity: chimneyP }}>
          <rect x="128" y="66" width="12" height="20" fill="#7c2d12" />
          <rect x="126" y="64" width="16" height="4" fill="#451a03" />
        </motion.g>

        <motion.g animate={{ opacity: decorP }}>
          <rect x="19" y="138" width="5" height="14" fill="#78350f" />
          <circle cx="21.5" cy="135" r="10" fill="#22c55e" />
          <circle cx="16" cy="130" r="6" fill="#16a34a" />
          <circle cx="27" cy="131" r="7" fill="#16a34a" />

          <circle cx="175" cy="150" r="2" fill="#ec4899" />
          <rect x="174.3" y="150" width="1.4" height="4" fill="#15803d" />
          <circle cx="185" cy="154" r="1.7" fill="#a855f7" />
          <rect x="184.3" y="154" width="1.4" height="3" fill="#15803d" />
        </motion.g>
      </>
    );
  },
};

// ---------- Theme 2: 石砌小屋 ----------
const themeCottage = {
  id: 'cottage',
  name: '石砌小屋',
  skyFrom: '#fce7f3',
  skyTo: '#fef3c7',
  groundColor: '#a7f3d0',
  groundLineColor: '#34d399',
  sunColor: '#fb923c',
  sunRayColor: '#f97316',
  render: (p, full) => {
    const wallH = 55 * ramp(p, 0.08, 0.48);
    const wallY = 148 - wallH;
    const openingOpacity = ramp(p, 0.42, 0.6);
    const roofP = ramp(p, 0.58, 0.82);
    const chimneyP = ramp(p, 0.82, 0.95);
    const decorP = ramp(p, 0.95, 1);
    const revealRatio = Math.min(1, wallH / 55);
    return (
      <>
        <motion.rect x="38" y="148" width="124" height="8" fill="#44403c" rx="1"
          animate={{ opacity: p > 0 ? 1 : 0.35 }} />

        <motion.rect x="52" width="96" fill="#d6d3d1" stroke="#57534e" strokeWidth="1.5"
          animate={{ y: wallY, height: wallH }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }} />

        {revealRatio > 0 && (
          <motion.g animate={{ opacity: revealRatio }}>
            {Array.from({ length: 6 }).map((_, row) =>
              Array.from({ length: 5 }).map((__, col) => {
                const cx = 60 + col * 16 + (row % 2) * 8;
                const cy = 142 - row * 9;
                if (cy < wallY + 2) return null;
                return (
                  <ellipse key={`${row}-${col}`} cx={cx} cy={cy} rx="6" ry="3.5"
                    fill="#a8a29e" stroke="#78716c" strokeWidth="0.6" />
                );
              })
            )}
          </motion.g>
        )}

        <motion.g animate={{ opacity: openingOpacity }}>
          <path d="M 92 148 L 92 128 Q 92 120 100 120 Q 108 120 108 128 L 108 148 Z"
            fill="#b91c1c" stroke="#7f1d1d" strokeWidth="1" />
          <circle cx="104" cy="136" r="1.2" fill="#fbbf24" />

          <rect x="60" y="116" width="16" height="14" fill={full ? '#fef3c7' : '#f0f9ff'} stroke="#0c4a6e" strokeWidth="0.8" />
          <rect x="56" y="114" width="4" height="18" fill="#166534" />
          <rect x="76" y="114" width="4" height="18" fill="#166534" />

          <rect x="124" y="116" width="16" height="14" fill={full ? '#fef3c7' : '#f0f9ff'} stroke="#0c4a6e" strokeWidth="0.8" />
          <rect x="120" y="114" width="4" height="18" fill="#166534" />
          <rect x="140" y="114" width="4" height="18" fill="#166534" />
        </motion.g>

        <motion.g style={{ transformOrigin: '100px 95px' }} animate={{ opacity: roofP, scaleY: roofP }}>
          <polygon points="40,95 100,56 160,95" fill="#a16207" stroke="#713f12" strokeWidth="1.5" />
          {Array.from({ length: 7 }).map((_, i) => (
            <path key={i}
              d={`M ${45 + i * 17} ${95 - i * 2} Q ${48 + i * 17} ${91 - i * 2} ${52 + i * 17} ${95 - i * 2}`}
              stroke="#78350f" strokeWidth="0.8" fill="none" />
          ))}
        </motion.g>

        <motion.g animate={{ opacity: chimneyP }}>
          <rect x="128" y="66" width="12" height="20" fill="#78716c" stroke="#44403c" strokeWidth="0.8" />
          <rect x="126" y="64" width="16" height="4" fill="#e7e5e4" />
        </motion.g>

        <motion.g animate={{ opacity: decorP }}>
          <rect x="13" y="144" width="4" height="9" fill="#166534" />
          <circle cx="11" cy="142" r="2.5" fill="#dc2626" />
          <circle cx="17" cy="140" r="2.5" fill="#ef4444" />
          <circle cx="19" cy="144" r="2.5" fill="#f87171" />

          <ellipse cx="180" cy="152" rx="5" ry="2.5" fill="#fef3c7" />
          <circle cx="180" cy="149" r="4" fill="#dc2626" />
          <circle cx="178" cy="148" r="0.8" fill="#fff" />
          <circle cx="181" cy="147.5" r="0.8" fill="#fff" />
          <circle cx="182.5" cy="150" r="0.7" fill="#fff" />
        </motion.g>
      </>
    );
  },
};

// ---------- Theme 3: 現代簡約 ----------
const themeModern = {
  id: 'modern',
  name: '現代簡約',
  skyFrom: '#dbeafe',
  skyTo: '#f5f3ff',
  groundColor: '#d1d5db',
  groundLineColor: '#9ca3af',
  sunColor: '#fde047',
  sunRayColor: '#facc15',
  render: (p, full) => {
    const wallH = 55 * ramp(p, 0.08, 0.48);
    const wallY = 148 - wallH;
    const openingOpacity = ramp(p, 0.42, 0.6);
    const roofP = ramp(p, 0.58, 0.82);
    const chimneyP = ramp(p, 0.82, 0.95);
    const decorP = ramp(p, 0.95, 1);
    return (
      <>
        <motion.rect x="36" y="146" width="128" height="10" fill="#111827" rx="0"
          animate={{ opacity: p > 0 ? 1 : 0.35 }} />

        <motion.rect x="50" width="100" fill="#fafafa" stroke="#1f2937" strokeWidth="1.5"
          animate={{ y: wallY, height: wallH }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }} />

        <motion.g animate={{ opacity: openingOpacity }}>
          <rect x="90" y="118" width="20" height="30" fill="#111827" />
          <rect x="108" y="132" width="1.5" height="3" fill="#facc15" />

          <rect x="58" y="108" width="22" height="30" fill={full ? '#fde68a' : '#1e293b'} />
          <line x1="69" y1="108" x2="69" y2="138" stroke="#fff" strokeWidth="0.5" />

          <rect x="120" y="108" width="22" height="30" fill={full ? '#fde68a' : '#1e293b'} />
          <line x1="131" y1="108" x2="131" y2="138" stroke="#fff" strokeWidth="0.5" />
        </motion.g>

        <motion.g style={{ transformOrigin: '100px 90px' }} animate={{ opacity: roofP, scaleY: roofP }}>
          <rect x="44" y="86" width="112" height="8" fill="#1f2937" />
          <rect x="46" y="82" width="108" height="4" fill="#374151" />
        </motion.g>

        <motion.g animate={{ opacity: chimneyP }}>
          <rect x="132" y="60" width="4" height="24" fill="#4b5563" />
          <circle cx="134" cy="60" r="3" fill="#4b5563" />
        </motion.g>

        <motion.g animate={{ opacity: decorP }}>
          <rect x="18" y="130" width="2.5" height="24" fill="#166534" />
          <ellipse cx="19.2" cy="132" rx="3" ry="5" fill="#16a34a" />
          <ellipse cx="19.2" cy="140" rx="3" ry="5" fill="#22c55e" />
          <ellipse cx="19.2" cy="148" rx="3" ry="4" fill="#4ade80" />

          <ellipse cx="178" cy="152" rx="6" ry="2" fill="#a8a29e" />
          <ellipse cx="184" cy="150" rx="4" ry="1.5" fill="#78716c" />
          <ellipse cx="172" cy="151" rx="3" ry="1.2" fill="#a8a29e" />
        </motion.g>
      </>
    );
  },
};

// ---------- Theme 4: 和風櫻花 ----------
const themeSakura = {
  id: 'sakura',
  name: '和風櫻花',
  skyFrom: '#fce7f3',
  skyTo: '#fef9c3',
  groundColor: '#bbf7d0',
  groundLineColor: '#86efac',
  sunColor: '#fb7185',
  sunRayColor: '#f43f5e',
  render: (p, full) => {
    const wallH = 55 * ramp(p, 0.08, 0.48);
    const wallY = 148 - wallH;
    const openingOpacity = ramp(p, 0.42, 0.6);
    const roofP = ramp(p, 0.58, 0.82);
    const chimneyP = ramp(p, 0.82, 0.95);
    const decorP = ramp(p, 0.95, 1);
    return (
      <>
        <motion.rect x="38" y="148" width="124" height="8" fill="#44403c" rx="1"
          animate={{ opacity: p > 0 ? 1 : 0.35 }} />

        <motion.rect x="52" width="96" fill="#fef3c7" stroke="#78350f" strokeWidth="1.5"
          animate={{ y: wallY, height: wallH }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }} />

        {wallH > 5 && (
          <motion.g animate={{ opacity: Math.min(1, wallH / 30) }}>
            <rect x="52" y={wallY} width="2" height={wallH} fill="#78350f" />
            <rect x="146" y={wallY} width="2" height={wallH} fill="#78350f" />
            <rect x="52" y={wallY} width="96" height="2" fill="#78350f" />
            <rect x="98" y={wallY} width="2" height={wallH} fill="#78350f" />
          </motion.g>
        )}

        <motion.g animate={{ opacity: openingOpacity }}>
          <rect x="88" y="122" width="24" height="26" fill="#fef9c3" stroke="#78350f" strokeWidth="1" />
          <line x1="100" y1="122" x2="100" y2="148" stroke="#78350f" strokeWidth="1" />
          <line x1="88" y1="134" x2="112" y2="134" stroke="#78350f" strokeWidth="0.6" />

          <rect x="60" y="116" width="20" height="14" fill={full ? '#fef3c7' : '#e0f2fe'} stroke="#78350f" strokeWidth="1" />
          <line x1="67" y1="116" x2="67" y2="130" stroke="#78350f" strokeWidth="0.5" />
          <line x1="73" y1="116" x2="73" y2="130" stroke="#78350f" strokeWidth="0.5" />
          <line x1="60" y1="123" x2="80" y2="123" stroke="#78350f" strokeWidth="0.5" />

          <rect x="120" y="116" width="20" height="14" fill={full ? '#fef3c7' : '#e0f2fe'} stroke="#78350f" strokeWidth="1" />
          <line x1="127" y1="116" x2="127" y2="130" stroke="#78350f" strokeWidth="0.5" />
          <line x1="133" y1="116" x2="133" y2="130" stroke="#78350f" strokeWidth="0.5" />
          <line x1="120" y1="123" x2="140" y2="123" stroke="#78350f" strokeWidth="0.5" />
        </motion.g>

        <motion.g style={{ transformOrigin: '100px 95px' }} animate={{ opacity: roofP, scaleY: roofP }}>
          <path d="M 36 96 Q 40 62 100 56 Q 160 62 164 96 L 148 96 Q 144 72 100 68 Q 56 72 52 96 Z"
            fill="#1e40af" stroke="#1e3a8a" strokeWidth="1.5" />
          <path d="M 52 96 L 148 96" stroke="#1e3a8a" strokeWidth="0.8" />
          <path d="M 60 90 L 140 90" stroke="#1e3a8a" strokeWidth="0.6" opacity="0.5" />
        </motion.g>

        <motion.g animate={{ opacity: chimneyP }}>
          <rect x="166" y="128" width="2" height="22" fill="#44403c" />
          <rect x="162" y="126" width="10" height="4" fill="#dc2626" />
          <rect x="163" y="116" width="8" height="10" fill="#fef9c3" stroke="#78350f" strokeWidth="0.6" />
          <polygon points="160,116 174,116 167,108" fill="#dc2626" />
        </motion.g>

        <motion.g animate={{ opacity: decorP }}>
          <rect x="24" y="146" width="3" height="8" fill="#78350f" />
          <ellipse cx="25.5" cy="143" rx="6" ry="5" fill="#f472b6" />
          <circle cx="22" cy="143" r="2" fill="#f9a8d4" />
          <circle cx="28" cy="141" r="2" fill="#fbcfe8" />
          <circle cx="29" cy="146" r="2" fill="#ec4899" />
          <circle cx="21" cy="146" r="1.5" fill="#fdf2f8" />
        </motion.g>

        {full && (
          <g>
            {Array.from({ length: 8 }).map((_, i) => (
              <motion.circle key={`petal-${i}`}
                r="1.5" fill="#f9a8d4"
                initial={{ cx: 20 + i * 25, cy: -5, opacity: 0.8 }}
                animate={{ cy: 180, cx: 20 + i * 25 + (i % 2 ? 15 : -15), rotate: 360, opacity: [0.8, 0.9, 0] }}
                transition={{ duration: 5 + (i % 3), repeat: Infinity, delay: i * 0.4, ease: 'easeIn' }} />
            ))}
          </g>
        )}
      </>
    );
  },
  celebration: () => null,
};

// ---------- Theme 5: 雪地木屋 ----------
const themeCabin = {
  id: 'cabin',
  name: '雪地木屋',
  skyFrom: '#dbeafe',
  skyTo: '#e0e7ff',
  groundColor: '#f1f5f9',
  groundLineColor: '#cbd5e1',
  sunColor: '#fef08a',
  sunRayColor: '#facc15',
  render: (p, full) => {
    const wallH = 55 * ramp(p, 0.08, 0.48);
    const wallY = 148 - wallH;
    const openingOpacity = ramp(p, 0.42, 0.6);
    const roofP = ramp(p, 0.58, 0.82);
    const chimneyP = ramp(p, 0.82, 0.95);
    const decorP = ramp(p, 0.95, 1);
    const logCount = Math.max(1, Math.floor(wallH / 10));
    return (
      <>
        <motion.rect x="38" y="148" width="124" height="8" fill="#44403c" rx="1"
          animate={{ opacity: p > 0 ? 1 : 0.35 }} />

        <motion.rect x="52" width="96" fill="#92400e" stroke="#451a03" strokeWidth="1.5"
          animate={{ y: wallY, height: wallH }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }} />

        {Array.from({ length: logCount }).map((_, i) => {
          const y = 148 - i * 10 - 10;
          if (y < wallY + 2) return null;
          return (
            <line key={i} x1="52" y1={y} x2="148" y2={y} stroke="#451a03" strokeWidth="0.8" />
          );
        })}

        <motion.g animate={{ opacity: openingOpacity }}>
          <rect x="91" y="122" width="18" height="26" fill="#78350f" stroke="#451a03" strokeWidth="1" />
          <line x1="95" y1="122" x2="95" y2="148" stroke="#451a03" strokeWidth="0.6" />
          <line x1="100" y1="122" x2="100" y2="148" stroke="#451a03" strokeWidth="0.6" />
          <line x1="105" y1="122" x2="105" y2="148" stroke="#451a03" strokeWidth="0.6" />
          <circle cx="106" cy="136" r="1.2" fill="#fef3c7" />

          <rect x="60" y="116" width="16" height="14" fill={full ? '#fde68a' : '#0c4a6e'} stroke="#451a03" strokeWidth="1" />
          <rect x="56" y="114" width="4" height="18" fill="#b91c1c" />
          <rect x="76" y="114" width="4" height="18" fill="#b91c1c" />
          <line x1="68" y1="116" x2="68" y2="130" stroke="#451a03" strokeWidth="0.6" />
          <line x1="60" y1="123" x2="76" y2="123" stroke="#451a03" strokeWidth="0.6" />

          <rect x="124" y="116" width="16" height="14" fill={full ? '#fde68a' : '#0c4a6e'} stroke="#451a03" strokeWidth="1" />
          <rect x="120" y="114" width="4" height="18" fill="#b91c1c" />
          <rect x="140" y="114" width="4" height="18" fill="#b91c1c" />
          <line x1="132" y1="116" x2="132" y2="130" stroke="#451a03" strokeWidth="0.6" />
          <line x1="124" y1="123" x2="140" y2="123" stroke="#451a03" strokeWidth="0.6" />
        </motion.g>

        <motion.g style={{ transformOrigin: '100px 95px' }} animate={{ opacity: roofP, scaleY: roofP }}>
          <polygon points="40,95 100,56 160,95" fill="#7c2d12" stroke="#431407" strokeWidth="1.5" />
          <path d="M 40 95 Q 50 88 60 94 Q 70 86 80 92 Q 90 84 100 56 Q 110 84 120 92 Q 130 86 140 94 Q 150 88 160 95 Z"
            fill="#fafafa" stroke="#e5e7eb" strokeWidth="0.8" opacity="0.95" />
        </motion.g>

        <motion.g animate={{ opacity: chimneyP }}>
          <rect x="128" y="66" width="12" height="20" fill="#57534e" stroke="#292524" strokeWidth="0.8" />
          <rect x="126" y="62" width="16" height="6" fill="#fafafa" />
        </motion.g>

        <motion.g animate={{ opacity: decorP }}>
          <rect x="18" y="135" width="4" height="18" fill="#451a03" />
          <polygon points="10,135 30,135 20,118" fill="#166534" />
          <polygon points="11,125 29,125 20,108" fill="#15803d" />
          <polygon points="13,115 27,115 20,100" fill="#166534" />

          <ellipse cx="30" cy="154" rx="10" ry="3" fill="#fafafa" />
          <ellipse cx="170" cy="154" rx="14" ry="3" fill="#fafafa" />

          {Array.from({ length: 5 }).map((_, i) => (
            <motion.circle key={`snow-${i}`} r="1.2" fill="#fafafa"
              initial={{ cx: 20 + i * 35, cy: 0, opacity: 0.8 }}
              animate={{ cy: 160, opacity: [0.8, 0.9, 0.2] }}
              transition={{ duration: 4 + i, repeat: Infinity, delay: i * 0.6, ease: 'linear' }} />
          ))}
        </motion.g>
      </>
    );
  },
};

// ---------- Theme 6: 蘑菇小屋 ----------
const themeMushroom = {
  id: 'mushroom',
  name: '蘑菇小屋',
  skyFrom: '#ede9fe',
  skyTo: '#fce7f3',
  groundColor: '#a7f3d0',
  groundLineColor: '#6ee7b7',
  sunColor: '#fde047',
  sunRayColor: '#facc15',
  render: (p, full) => {
    const wallH = 50 * ramp(p, 0.08, 0.48);
    const wallY = 148 - wallH;
    const openingOpacity = ramp(p, 0.42, 0.6);
    const roofP = ramp(p, 0.58, 0.82);
    const chimneyP = ramp(p, 0.82, 0.95);
    const decorP = ramp(p, 0.95, 1);
    return (
      <>
        <motion.rect x="50" y="148" width="100" height="8" fill="#44403c" rx="3"
          animate={{ opacity: p > 0 ? 1 : 0.35 }} />

        <motion.rect x="56" rx="8" width="88" fill="#fef3c7" stroke="#a16207" strokeWidth="1.5"
          animate={{ y: wallY, height: wallH }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }} />

        <motion.g animate={{ opacity: openingOpacity }}>
          <path d="M 90 148 L 90 128 Q 90 116 100 116 Q 110 116 110 128 L 110 148 Z"
            fill="#facc15" stroke="#92400e" strokeWidth="1" />
          <circle cx="104" cy="134" r="1.4" fill="#78350f" />

          <circle cx="68" cy="122" r="7" fill={full ? '#fef3c7' : '#a5f3fc'} stroke="#92400e" strokeWidth="1" />
          <line x1="61" y1="122" x2="75" y2="122" stroke="#92400e" strokeWidth="0.6" />
          <line x1="68" y1="115" x2="68" y2="129" stroke="#92400e" strokeWidth="0.6" />

          <circle cx="132" cy="122" r="7" fill={full ? '#fef3c7' : '#a5f3fc'} stroke="#92400e" strokeWidth="1" />
          <line x1="125" y1="122" x2="139" y2="122" stroke="#92400e" strokeWidth="0.6" />
          <line x1="132" y1="115" x2="132" y2="129" stroke="#92400e" strokeWidth="0.6" />
        </motion.g>

        <motion.g style={{ transformOrigin: '100px 95px' }} animate={{ opacity: roofP, scaleY: roofP }}>
          <path d="M 32 98 Q 32 50 100 50 Q 168 50 168 98 Q 100 100 32 98 Z"
            fill="#dc2626" stroke="#7f1d1d" strokeWidth="1.5" />
          <circle cx="55" cy="80" r="6" fill="#fafafa" />
          <circle cx="85" cy="65" r="7" fill="#fafafa" />
          <circle cx="115" cy="70" r="6" fill="#fafafa" />
          <circle cx="145" cy="82" r="6" fill="#fafafa" />
          <circle cx="70" cy="92" r="4" fill="#fafafa" />
          <circle cx="130" cy="92" r="4" fill="#fafafa" />
        </motion.g>

        <motion.g animate={{ opacity: chimneyP }}>
          <path d="M 130 68 Q 134 62 130 56 Q 126 50 134 46" stroke="#78350f" strokeWidth="4" fill="none" strokeLinecap="round" />
        </motion.g>

        <motion.g animate={{ opacity: decorP }}>
          <rect x="20" y="144" width="3" height="8" fill="#fef3c7" />
          <path d="M 14 144 Q 21 138 28 144 Q 28 148 14 148 Z" fill="#dc2626" />
          <circle cx="18" cy="144" r="1" fill="#fafafa" />
          <circle cx="24" cy="145" r="1" fill="#fafafa" />

          <rect x="178" y="146" width="2" height="6" fill="#fef3c7" />
          <path d="M 173 146 Q 179 142 185 146 Q 185 149 173 149 Z" fill="#f97316" />
          <circle cx="177" cy="146" r="0.7" fill="#fafafa" />
          <circle cx="182" cy="147" r="0.7" fill="#fafafa" />
        </motion.g>

        {full && (
          <g>
            {Array.from({ length: 6 }).map((_, i) => (
              <motion.circle key={`firefly-${i}`}
                r="1.3" fill="#fde047"
                initial={{ cx: 40 + i * 22, cy: 70 }}
                animate={{
                  cx: [40 + i * 22, 50 + i * 22, 40 + i * 22],
                  cy: [70, 90, 70],
                  opacity: [1, 0.3, 1],
                }}
                transition={{ duration: 3 + (i % 2), repeat: Infinity, delay: i * 0.3 }} />
            ))}
          </g>
        )}
      </>
    );
  },
};

const ALL_THEMES = [themeClassic, themeCottage, themeModern, themeSakura, themeCabin, themeMushroom];

function pickRandomTheme() {
  return ALL_THEMES[Math.floor(Math.random() * ALL_THEMES.length)];
}

// ============================================
// House SVG (shared frame + theme-driven interior)
// ============================================
function HouseSvg({ progress, size = 160, celebrating = false, theme }) {
  const p = clamp01(progress);
  const full = p >= 0.999;
  const skyId = `hp-sky-${theme.id}`;

  return (
    <svg viewBox="0 0 200 180" width={size} height={size * 0.9}>
      <defs>
        <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={theme.skyFrom} />
          <stop offset="100%" stopColor={theme.skyTo} />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="200" height="180" fill={`url(#${skyId})`} />

      <motion.g
        animate={{ opacity: 0.5 + p * 0.5, rotate: full ? 360 : 0 }}
        transition={{ rotate: { duration: 30, repeat: Infinity, ease: 'linear' } }}
        style={{ transformOrigin: '170px 30px' }}
      >
        <circle cx="170" cy="30" r="11" fill={theme.sunColor} />
        {full && (
          <g stroke={theme.sunRayColor} strokeWidth="2" strokeLinecap="round">
            <line x1="170" y1="10" x2="170" y2="5" />
            <line x1="170" y1="50" x2="170" y2="55" />
            <line x1="150" y1="30" x2="145" y2="30" />
            <line x1="190" y1="30" x2="195" y2="30" />
            <line x1="156" y1="16" x2="152" y2="12" />
            <line x1="184" y1="44" x2="188" y2="48" />
            <line x1="156" y1="44" x2="152" y2="48" />
            <line x1="184" y1="16" x2="188" y2="12" />
          </g>
        )}
      </motion.g>

      <rect x="0" y="152" width="200" height="28" fill={theme.groundColor} />
      <rect x="0" y="152" width="200" height="3" fill={theme.groundLineColor} />

      {theme.render(p, full)}

      {full && (theme.celebration ? theme.celebration() : defaultSmoke())}

      {celebrating && (
        <g>
          {Array.from({ length: 16 }).map((_, i) => (
            <motion.circle
              key={`confetti-${i}`}
              cx={100}
              cy={90}
              r="2.5"
              fill={['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'][i % 6]}
              initial={{ cx: 100, cy: 90, opacity: 1 }}
              animate={{
                cx: 100 + Math.cos((i / 16) * Math.PI * 2) * 85,
                cy: 90 + Math.sin((i / 16) * Math.PI * 2) * 85,
                opacity: 0,
              }}
              transition={{ duration: 2, delay: i * 0.02 }} />
          ))}
        </g>
      )}
    </svg>
  );
}

// ============================================
// Main export
// ============================================
export default function HouseProgress({ annotatedCount = 0, total = 0 }) {
  const theme = useMemo(() => pickRandomTheme(), []);
  const progress = total > 0 ? annotatedCount / total : 0;
  const complete = total > 0 && annotatedCount >= total;
  const [showOverlay, setShowOverlay] = useState(false);
  const [hasShownOverlay, setHasShownOverlay] = useState(false);

  useEffect(() => {
    if (complete && !hasShownOverlay) {
      setShowOverlay(true);
      setHasShownOverlay(true);
    }
  }, [complete, hasShownOverlay]);

  if (total <= 0) return null;

  return (
    <>
      <motion.div
        className="house-progress"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="house-label">
          <span className="house-emoji">🏠</span>
          <span className="house-theme-name">{theme.name}</span>
          <strong>{annotatedCount}/{total}</strong>
        </div>
        <div className="house-canvas">
          <HouseSvg progress={progress} size={150} celebrating={false} theme={theme} />
        </div>
        <div className="house-progress-bar">
          <motion.div
            className="house-progress-fill"
            animate={{ width: `${progress * 100}%` }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          />
        </div>
      </motion.div>

      <AnimatePresence>
        {showOverlay && (
          <motion.div
            className="house-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowOverlay(false)}
          >
            <motion.div
              className="house-overlay-card"
              initial={{ scale: 0.6, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 140, damping: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                className="house-overlay-title"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                🎉 恭喜完成！
              </motion.div>
              <div className="house-overlay-sub">你的「{theme.name}」落成了</div>
              <div className="house-overlay-canvas">
                <HouseSvg progress={1} size={320} celebrating={true} theme={theme} />
              </div>
              <div className="house-overlay-stats">
                共完成 <strong>{annotatedCount}</strong> 個片段的標註
              </div>
              <button
                className="house-overlay-btn"
                onClick={() => setShowOverlay(false)}
              >
                繼續
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
