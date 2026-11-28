// src/pages/login/Ornaments.jsx
// The holiday art on the sign-in page: a garland with berries, five glass ornaments in the
// firm colors (outline draws in, then the glass fills), and gold sparkles. Each ornament
// has a "depth" used to lean it toward the mouse (src/pages/Login.jsx).
import React from "react";

const d = (l, delay) => ({ "--l": l, animationDelay: `${delay}s` });
const at = (delay) => ({ animationDelay: `${delay}s` });
const SPARK = (x, y, s) => `M${x} ${y} l${s} ${s * 3} ${s * 3} ${s} -${s * 3} ${s} -${s} ${s * 3} -${s} -${s * 3} -${s * 3} -${s} ${s * 3} -${s}z`;

function Ball({ depth, string, cap, children }) {
  return (
    <g className="hang">
      <g className="tilt" data-depth={depth}>
        <path className="draw" style={d(string.l, string.delay)} d={string.d} />
        <g className="ball">{children}</g>
        <rect className="fillin" style={at(cap.delay)} x={cap.x} y={cap.y} width={cap.w} height={cap.h} rx="2" fill="#E9C46A" stroke="none" />
      </g>
    </g>
  );
}

export default function Ornaments() {
  return (
    <svg className="orn" viewBox="0 0 600 800" preserveAspectRatio="xMidYMin slice" fill="none" stroke="#E9C46A" strokeWidth="1.4" aria-hidden="true">
      <defs>
        {[["gGold", "#fff3cf", "#E9C46A", "#8a6512"], ["gEmber", "#ffc2a8", "#D34E24", "#6e1f08"], ["gTeal", "#bff3ee", "#17A398", "#06463f"], ["gNavy", "#b9c0ff", "#2233a8", "#000C66"]].map(([id, a, b, c]) => (
          <radialGradient key={id} id={id} cx="35%" cy="30%" r="75%">
            <stop offset="0" stopColor={a} />
            <stop offset=".37" stopColor={b} />
            <stop offset="1" stopColor={c} />
          </radialGradient>
        ))}
      </defs>
      {/* garland: two strands and berries */}
      <path className="draw" style={d(760, 0)} d="M-10 40 C 120 110, 240 110, 300 70 S 480 20, 610 90" />
      <path className="draw" style={d(760, 0.2)} d="M-10 48 C 120 118, 240 116, 300 78 S 480 28, 610 98" opacity=".45" />
      <g fill="#D34E24" stroke="none" className="fillin" style={at(1.6)}>
        <circle cx="62" cy="76" r="3.2" /><circle cx="68" cy="80" r="2.6" /><circle cx="300" cy="74" r="3.2" /><circle cx="306" cy="70" r="2.6" /><circle cx="452" cy="44" r="3" /><circle cx="560" cy="72" r="3" />
      </g>

      <Ball depth="1" string={{ l: 120, delay: 0.4, d: "M110 88 V 170" }} cap={{ delay: 1.4, x: 100, y: 170, w: 20, h: 10 }}>
        <circle className="fillin" style={at(1.7)} cx="110" cy="206" r="30" fill="url(#gEmber)" stroke="none" />
        <circle className="draw" style={d(200, 0.9)} cx="110" cy="206" r="30" />
        <ellipse className="shine" cx="100" cy="194" rx="7" ry="11" fill="#fff" opacity=".5" stroke="none" transform="rotate(-25 100 194)" />
      </Ball>
      <Ball depth="1.6" string={{ l: 140, delay: 0.6, d: "M235 96 V 210" }} cap={{ delay: 1.6, x: 223, y: 210, w: 24, h: 11 }}>
        <circle className="fillin" style={at(1.9)} cx="235" cy="256" r="40" fill="url(#gGold)" stroke="none" />
        <circle className="draw" style={d(260, 1.1)} cx="235" cy="256" r="40" />
        <path className="fillin" style={at(2.1)} d="M197 244 q38 16 76 0 M197 266 q38 16 76 0" stroke="#8a6512" strokeWidth="1.6" opacity=".7" />
        <ellipse className="shine" cx="222" cy="240" rx="9" ry="14" fill="#fff" opacity=".5" stroke="none" transform="rotate(-25 222 240)" />
      </Ball>
      <Ball depth="1.2" string={{ l: 120, delay: 0.8, d: "M380 52 V 158" }} cap={{ delay: 1.7, x: 371, y: 158, w: 18, h: 9 }}>
        <path className="fillin" style={at(2)} d="M380 166 l28 48 -28 48 -28 -48z" fill="url(#gTeal)" stroke="none" />
        <path className="draw" style={d(230, 1.3)} d="M380 166 l28 48 -28 48 -28 -48z" />
        <path className="shine" d="M372 186 l-10 26" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".5" />
      </Ball>
      <Ball depth="0.8" string={{ l: 140, delay: 1, d: "M505 62 V 190" }} cap={{ delay: 1.8, x: 496, y: 190, w: 18, h: 9 }}>
        <circle className="fillin" style={at(2.2)} cx="505" cy="218" r="26" fill="url(#gNavy)" stroke="none" />
        <circle className="draw" style={d(180, 1.5)} cx="505" cy="218" r="26" />
        <ellipse className="shine" cx="496" cy="208" rx="6" ry="9" fill="#fff" opacity=".5" stroke="none" transform="rotate(-25 496 208)" />
      </Ball>
      <Ball depth="1.4" string={{ l: 100, delay: 1.2, d: "M30 66 V 140" }} cap={{ delay: 2, x: 23, y: 140, w: 14, h: 7 }}>
        <circle className="fillin" style={at(2.3)} cx="30" cy="160" r="18" fill="url(#gGold)" stroke="none" />
        <circle className="draw" style={d(120, 1.6)} cx="30" cy="160" r="18" />
      </Ball>

      <g fill="#E9C46A" stroke="none">
        {[[170, 160, 3, 0.2], [318, 212, 2, 1.1], [452, 150, 2.7, 1.9], [70, 360, 2, 0.7], [560, 360, 2, 1.5], [420, 330, 2, 2.4]].map(([x, y, s, delay]) => (
          <path key={`${x}-${y}`} className="spark" style={at(delay)} d={SPARK(x, y, s)} />
        ))}
      </g>
    </svg>
  );
}

/** Pine boughs with needles for the bottom-right corner (path data). */
export function boughPaths() {
  const boughs = [{ x: 600, y: 250, a: -140, len: 230, delay: 2.0 }, { x: 600, y: 190, a: -168, len: 170, delay: 2.3 }, { x: 560, y: 260, a: -108, len: 150, delay: 2.5 }];
  return boughs.map((b) => {
    const rad = (b.a * Math.PI) / 180;
    const ex = b.x + Math.cos(rad) * b.len;
    const ey = b.y + Math.sin(rad) * b.len;
    let path = `M${b.x} ${b.y} L${ex.toFixed(1)} ${ey.toFixed(1)}`;
    const steps = Math.round(b.len / 14);
    for (let i = 2; i < steps; i++) {
      const t = i / steps;
      const px = b.x + (ex - b.x) * t;
      const py = b.y + (ey - b.y) * t;
      const n = 16 * (1 - t * 0.6);
      for (const s of [-1, 1]) {
        const r2 = rad + s * 0.75;
        path += ` M${px.toFixed(1)} ${py.toFixed(1)} l${(Math.cos(r2) * n).toFixed(1)} ${(Math.sin(r2) * n).toFixed(1)}`;
      }
    }
    return { d: path, delay: b.delay };
  });
}

/** Small pine sprig with berries, for the corners of the sign-in side. */
export function Sprig({ className, color, berries }) {
  return (
    <svg className={className} viewBox="0 0 300 300" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M40 40 C 120 90, 190 150, 260 260" />
      <path d="M80 66 l-18 26 M80 66 l26 -10 M120 92 l-16 30 M120 92 l30 -8 M160 124 l-12 32 M160 124 l32 -4 M196 162 l-8 32 M196 162 l32 0 M226 206 l-4 30 M226 206 l30 6" />
      {berries && (
        <g fill="#D34E24" stroke="none">
          <circle cx="252" cy="248" r="7" /><circle cx="264" cy="238" r="6" /><circle cx="246" cy="234" r="5" />
        </g>
      )}
    </svg>
  );
}
