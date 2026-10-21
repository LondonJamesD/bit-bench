'use client';
import { useEffect, useState } from 'react';
import { soundPrefs, setSoundPref } from '../lib/audio';

// Music and sound-effect switches for the top bar. Solo only has effects.
export default function SoundToggles({ music = true }) {
  const [p, setP] = useState({ music: true, sfx: true });
  useEffect(() => setP(soundPrefs()), []);

  function flip(kind) {
    const on = !p[kind];
    setSoundPref(kind, on);
    setP({ ...p, [kind]: on });
  }

  return (
    <>
      {music && (
        <button type="button" className={`ghost${p.music ? ' active' : ''}`} aria-pressed={p.music} onClick={() => flip('music')}>
          Music {p.music ? 'on' : 'off'}
        </button>
      )}
      <button type="button" className={`ghost${p.sfx ? ' active' : ''}`} aria-pressed={p.sfx} onClick={() => flip('sfx')}>
        Sounds {p.sfx ? 'on' : 'off'}
      </button>
    </>
  );
}
