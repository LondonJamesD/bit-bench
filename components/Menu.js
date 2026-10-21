'use client';
import { useEffect, useRef } from 'react';

// A dropdown: a button showing the setting's current value that opens a panel
// of controls. Clicking outside or pressing Escape closes it. On narrow
// screens the panel opens in place instead of floating.
export default function Menu({ label, value, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => {
      const d = ref.current;
      if (d?.open && !d.contains(e.target)) d.open = false;
    };
    const esc = (e) => {
      const d = ref.current;
      if (e.key !== 'Escape' || !d?.open) return;
      d.open = false;
      d.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  return (
    <details className="menu" ref={ref}>
      <summary>
        <span className="menu-lbl">{label}</span>
        <span className="menu-val">{value}</span>
        <span className="caret" aria-hidden="true">▾</span>
      </summary>
      <div className="menu-pop">{children}</div>
    </details>
  );
}
