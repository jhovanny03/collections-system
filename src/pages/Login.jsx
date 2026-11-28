// src/pages/Login.jsx
// Sign-in page ("Evergreen"): Google sign-in only, firm accounts only (@rahmanlawpllc.com:
// src/services/authService.js asks Google for firm accounts and checks the address, and
// src/auth/AuthProvider.jsx signs out any other account).
// Left: the firm panel. From Nov 24 to Jan 6 it wears the holiday look (garland, glass
// ornaments that lean toward the mouse, gold snow, pine boughs); the rest of the year the
// same layout shows in navy without them. Right: greeting by time of day and the button.
// Styles: ./login/evergreen.css. Motion stops for people who turned on "reduce motion".
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { COMPANY_DOMAIN } from "../services/authService";
import logo from "../assets/rahman-law-logo.svg";
import logoGold from "../assets/rahman-law-logo-gold.svg";
import Ornaments, { Sprig, boughPaths } from "./login/Ornaments";
import "./login/evergreen.css";

/** Holiday look: November 24 through January 6. */
export function isHolidaySeason(d = new Date()) {
  const m = d.getMonth();
  const day = d.getDate();
  return (m === 10 && day >= 24) || m === 11 || (m === 0 && day <= 6);
}

const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

/** Slow gold snow on a canvas (holiday look only). */
function useSnow(ref, on) {
  useEffect(() => {
    const canvas = ref.current;
    if (!on || !canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    let raf = 0;
    let flakes = [];
    const make = (y) => {
      const r = 0.6 + Math.random() * 2;
      return { x: Math.random() * w, y: y ?? Math.random() * h, r, vy: 0.32 * (0.4 + r / 2), a: (0.25 + Math.random() * 0.55) * 0.6, p: Math.random() * 6.28 };
    };
    const size = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const frame = (t) => {
      if (canvas.clientWidth !== w || canvas.clientHeight !== h) {
        const was = w;
        size();
        if (!was) flakes = flakes.map(() => make());
      }
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        f.y += f.vy;
        f.x += Math.sin(t / 1800 + f.p) * 0.35;
        if (f.y > h + 4) Object.assign(f, make(-4));
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, 6.283);
        ctx.fillStyle = `rgba(233,196,106,${f.a})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    size();
    flakes = Array.from({ length: 55 }, () => make());
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ref, on]);
}

export default function Login() {
  const { loginWithGoogle, disabledNotice, domainNotice } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lit, setLit] = useState(false);
  const [burst, setBurst] = useState(null);
  const artRef = useRef(null);
  const snowRef = useRef(null);
  const btnRef = useRef(null);
  const holiday = useMemo(() => isHolidaySeason(), []);
  const boughs = useMemo(() => (holiday ? boughPaths() : []), [holiday]);
  useSnow(snowRef, holiday);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  // Ornaments lean gently toward the mouse, each by its own depth.
  useEffect(() => {
    const art = artRef.current;
    if (!holiday || !art || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const tilts = [...art.querySelectorAll(".tilt")];
    const move = (e) => {
      const r = art.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      tilts.forEach((t) => (t.style.transform = `rotate(${(-x * 7 * Number(t.dataset.depth)).toFixed(2)}deg)`));
    };
    const leave = () => tilts.forEach((t) => (t.style.transform = ""));
    art.addEventListener("pointermove", move);
    art.addEventListener("pointerleave", leave);
    return () => {
      art.removeEventListener("pointermove", move);
      art.removeEventListener("pointerleave", leave);
    };
  }, [holiday]);

  async function signIn() {
    setError("");
    setBusy(true);
    try {
      await loginWithGoogle();
      // A small gold sparkle off the button, and the ornaments glow.
      setLit(true);
      const b = btnRef.current && btnRef.current.getBoundingClientRect();
      if (b) setBurst({ x: b.left + b.width / 2, y: b.top + b.height / 2 });
      setTimeout(() => navigate("/dashboard", { replace: true }), holiday ? 650 : 0);
    } catch (err) {
      const code = String((err && err.code) || "");
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") setError("");
      else if (code === "auth/popup-blocked") setError("Your browser blocked the Google window. Allow pop-ups for this site and try again.");
      else setError(err && err.message ? err.message : "Google sign-in failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className={`rl-login${lit ? " lit" : ""}`}>
      <div className="split">
        <section className={`art${holiday ? "" : " plain"}`} ref={artRef}>
          {holiday && <canvas className="snow" ref={snowRef} />}
          {holiday && <Ornaments />}
          {holiday && (
            <svg className="branches" viewBox="0 0 600 260" preserveAspectRatio="xMaxYMax slice" fill="none" stroke="#E9C46A" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
              {boughs.map((b) => <path key={b.d.slice(0, 24)} className="draw" d={b.d} opacity=".55" style={{ "--l": 4000, animationDelay: `${b.delay}s`, animationDuration: "3s" }} />)}
            </svg>
          )}
          <div className="brand">
            <div className="eyebrow">{holiday ? `Happy holidays ${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}` : "Rahman Law · Collections"}</div>
            <img src={logoGold} alt="Moumita Rahman Immigration Attorneys" />
            {holiday ? (
              <>
                <h2>Season's greetings<br />from <b>Rahman Law</b></h2>
                <p>Thank you for everything you did for our clients this year.</p>
              </>
            ) : (
              <>
                <h2>Billing, plans and<br /><b>follow-ups</b> in one place</h2>
                <p>Every payment from MyCase, every plan and every call, for the whole team.</p>
              </>
            )}
          </div>
        </section>

        <section className="side">
          {holiday && <Sprig className="sprig" color="#0c3f38" berries />}
          {holiday && <Sprig className="sprig2" color="#C9961A" />}
          <div className="panel">
            <div className="top">
              <img src={logo} alt="Rahman Law" />
              <span className="date">{today}</span>
            </div>
            <h1>{greeting}<span>.</span></h1>
            <p className="sub">Sign in to Collections with your Rahman Law Google account.</p>

            <button ref={btnRef} type="button" className="google" onClick={signIn} disabled={busy}>
              {busy ? <span className="spin" /> : <span className="g"><GoogleG /></span>}
              {busy ? "Signing in…" : "Sign in with Google"}
            </button>
            <div className="note">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
              <span>Only @{COMPANY_DOMAIN} accounts can sign in. Need access? Ask an admin to add you in Users &amp; roles.</span>
            </div>

            {error && <div className="msg" role="alert">{error}</div>}
            {!error && domainNotice && <div className="msg" role="alert">That Google account isn't a Rahman Law account. Sign in with your @{COMPANY_DOMAIN} email.</div>}
            {!error && disabledNotice && <div className="msg info" role="alert">Your access to Collections is turned off. Ask an admin if you need it back.</div>}

            <div className="foot">
              <span>{holiday ? "Happy holidays from the Rahman Law team" : "Moumita Rahman Immigration Attorneys"}</span>
              <span><i style={{ background: "#D34E24" }} /><i style={{ background: "#E9C46A" }} /><i style={{ background: "#17A398" }} /></span>
            </div>
          </div>
        </section>
      </div>
      {burst && (
        <div className="burst" style={{ left: burst.x, top: burst.y }}>
          {Array.from({ length: 18 }, (_, i) => {
            const a = (i / 18) * Math.PI * 2;
            const r = 50 + ((i * 37) % 40);
            return <i key={i} style={{ "--x": `${Math.cos(a) * r}px`, "--y": `${Math.sin(a) * r}px`, background: ["#E9C46A", "#D34E24", "#17A398"][i % 3] }} />;
          })}
        </div>
      )}
    </div>
  );
}
