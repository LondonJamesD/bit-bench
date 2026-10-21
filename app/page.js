'use client';
import { useEffect, useState } from 'react';
import Solo from '../components/Solo';
import Multiplayer from '../components/Multiplayer';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../lib/binary';
import { load, save } from '../lib/storage';

export default function Home() {
  const [settings, setSettingsState] = useState(DEFAULT_SETTINGS);
  const [mode, setModeState] = useState('easy');
  const [tab, setTab] = useState('solo');
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => {
    setSettingsState(sanitizeSettings(load('bitbench.settings', {})));
    setModeState(load('bitbench.mode', 'easy') === 'hard' ? 'hard' : 'easy');
    const code = new URLSearchParams(window.location.search).get('room');
    if (code) {
      setInviteCode(code);
      setTab('multi');
    }
  }, []);

  const setSettings = (s) => { setSettingsState(s); save('bitbench.settings', s); };
  const setMode = (m) => { setModeState(m); save('bitbench.mode', m); };

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            {[0, 1, 0, 0, 0, 0, 1, 0].map((b, i) => <i key={i} className={b ? 'on' : ''} />)}
          </div>
          <div>
            <h1>Bit Bench</h1>
            <p className="tag">Practice binary conversion, arithmetic and two&apos;s complement</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Game type">
          <button type="button" className={tab === 'solo' ? 'on' : ''} aria-pressed={tab === 'solo'} onClick={() => setTab('solo')}>Solo practice</button>
          <button type="button" className={tab === 'multi' ? 'on' : ''} aria-pressed={tab === 'multi'} onClick={() => setTab('multi')}>Showdown</button>
        </nav>
      </header>
      <main>
        {/* Both stay mounted so a room keeps running if you peek at solo practice. */}
        <div hidden={tab !== 'solo'}>
          <Solo settings={settings} setSettings={setSettings} mode={mode} setMode={setMode} />
        </div>
        <div hidden={tab !== 'multi'}>
          <Multiplayer settings={settings} setSettings={setSettings} mode={mode} setMode={setMode} inviteCode={inviteCode}
            visible={tab === 'multi'} />
        </div>
      </main>
    </div>
  );
}
