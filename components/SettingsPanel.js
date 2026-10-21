'use client';
import { useEffect, useState } from 'react';
import { TYPES, PRESETS, SYM, ROUND_OPTIONS, num, fmtDec } from '../lib/binary';
import { load, save } from '../lib/storage';
import Menu from './Menu';

const OP_TITLE = { add: 'Addition', sub: 'Subtraction', mul: 'Multiplication', div: 'Division' };

// Game settings + round mix with saved profiles, as a row of dropdown menus.
// children: extra menus to put first (Difficulty).
// readOnly: other players in a room see the host's settings but can't change them.
export default function SettingsPanel({ settings, onChange, readOnly = false, idPrefix = 's', children }) {
  const [profiles, setProfiles] = useState({});
  const [name, setName] = useState('');
  const [msg, setMsg] = useState({ err: '', note: '' });

  useEffect(() => setProfiles(load('bitbench.profiles', {})), []);

  const set = (patch) => onChange({ ...settings, ...patch });
  const N = num(settings.bits);
  const total = TYPES.reduce((s, t) => s + settings.weights[t.id], 0);

  const weightsFor = (key) =>
    key.startsWith('p:') ? PRESETS[key.slice(2)] : key.startsWith('u:') ? profiles[key.slice(2)] : null;
  const profileKey = weightsFor(settings.profile) ? settings.profile : 'custom';

  function pickProfile(key) {
    const w = weightsFor(key);
    setMsg({ err: '', note: '' });
    if (!w) return set({ profile: 'custom' });
    const weights = {};
    for (const t of TYPES) weights[t.id] = w[t.id] || 0;
    set({ profile: key, weights });
  }
  function setWeight(id, v) {
    const weights = { ...settings.weights, [id]: v };
    const w = weightsFor(settings.profile);
    const same = w && TYPES.every((t) => (w[t.id] || 0) === weights[t.id]);
    set({ weights, profile: same ? settings.profile : 'custom' });
  }
  function saveProfile() {
    const n = name.trim().slice(0, 40);
    if (!n) return setMsg({ err: 'Give the profile a name first.', note: '' });
    if (!total) return setMsg({ err: 'Set at least one round type above 0 before saving.', note: '' });
    const next = { ...profiles, [n]: { ...settings.weights } };
    setProfiles(next);
    save('bitbench.profiles', next);
    set({ profile: 'u:' + n });
    setName('');
    setMsg({ err: '', note: `Saved “${n}”.` });
  }
  function deleteProfile() {
    const n = profileKey.slice(2);
    const next = { ...profiles };
    delete next[n];
    setProfiles(next);
    save('bitbench.profiles', next);
    set({ profile: 'custom' });
    setMsg({ err: '', note: `Deleted “${n}”. Its mix is still loaded.` });
  }

  const profileName = profileKey === 'custom' ? 'Custom' : profileKey.slice(2);
  let lastGroup = '';
  return (
    <fieldset className="menus" disabled={readOnly}>
      {children}
      <Menu label="Game" value={`${settings.bits} bits · ${settings.rounds} rounds`}>
        <div className="field">
          <label className="lbl" htmlFor={`${idPrefix}-bits`}>
            Register width <output>{settings.bits} bits</output>
          </label>
          <input type="range" id={`${idPrefix}-bits`} min="4" max="16" step="1" value={settings.bits}
            onChange={(e) => set({ bits: +e.target.value })} />
          <p className="hint">Unsigned 0 to {N.MAX} · Signed {fmtDec(N.LO)} to {N.HI}</p>
        </div>
        <div className="field">
          <label className="lbl" htmlFor={`${idPrefix}-rounds`}>Rounds per game</label>
          <select id={`${idPrefix}-rounds`} value={settings.rounds} onChange={(e) => set({ rounds: +e.target.value })}>
            {ROUND_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="field">
          <span className="lbl">Answer calculations in</span>
          <div className="seg">
            {[['bin', 'Binary'], ['dec', 'Decimal'], ['mixed', 'Mixed']].map(([v, l]) => (
              <span key={v}>
                <input type="radio" name={`${idPrefix}-fmt`} id={`${idPrefix}-fmt-${v}`} checked={settings.format === v}
                  onChange={() => set({ format: v })} />
                <label htmlFor={`${idPrefix}-fmt-${v}`}>{l}</label>
              </span>
            ))}
          </div>
          <p className="hint">Conversion rounds always ask for the other base.</p>
        </div>
        <div className="field">
          <span className="lbl">Operations</span>
          <div className="chips">
            {Object.keys(SYM).map((k) => (
              <span key={k}>
                <input type="checkbox" id={`${idPrefix}-op-${k}`} checked={!!settings.ops[k]}
                  onChange={(e) => set({ ops: { ...settings.ops, [k]: e.target.checked } })} />
                <label htmlFor={`${idPrefix}-op-${k}`} title={OP_TITLE[k]}>{SYM[k]}</label>
              </span>
            ))}
          </div>
          <p className="hint">Division always comes out exact. Results stay inside the register.</p>
        </div>
      </Menu>

      <Menu label="Round mix" value={profileName}>
        <div className="field">
          <label className="lbl" htmlFor={`${idPrefix}-profile`}>Profile</label>
          <div className="row">
            <select id={`${idPrefix}-profile`} value={profileKey} onChange={(e) => pickProfile(e.target.value)}>
              <optgroup label="Presets">
                {Object.keys(PRESETS).map((k) => <option key={k} value={'p:' + k}>{k}</option>)}
              </optgroup>
              {Object.keys(profiles).length > 0 && (
                <optgroup label="My profiles">
                  {Object.keys(profiles).map((k) => <option key={k} value={'u:' + k}>{k}</option>)}
                </optgroup>
              )}
              <option value="custom">Custom (unsaved)</option>
            </select>
            {profileKey.startsWith('u:') && !readOnly && (
              <button type="button" className="ghost" onClick={deleteProfile}>Delete</button>
            )}
          </div>
        </div>
        <div className="mix">
          {TYPES.map((t) => {
            const head = t.group !== lastGroup ? (lastGroup = t.group) : null;
            const w = settings.weights[t.id];
            return (
              <div key={t.id}>
                {head && <div className="mix-group">{head}</div>}
                <div className="mix-row">
                  <div className="mix-name">
                    <label htmlFor={`${idPrefix}-w-${t.id}`}>{t.name}</label>
                    <span className="hint">{t.desc}</span>
                  </div>
                  <input type="range" min="0" max="5" step="1" id={`${idPrefix}-w-${t.id}`} value={w}
                    onChange={(e) => setWeight(t.id, +e.target.value)} />
                  <span className="mix-val"><b>{w}</b><small>{total ? Math.round((w / total) * 100) : 0}%</small></span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="hint">Each slider sets how often that round type comes up. 0 turns it off. Trivia rounds get a 30-second clock in showdowns.</p>
        {!readOnly && (
          <div className="field">
            <label className="lbl" htmlFor={`${idPrefix}-pname`}>Save this mix as a profile</label>
            <div className="row">
              <input type="text" id={`${idPrefix}-pname`} placeholder="e.g. Exam warm-up" maxLength={40} value={name}
                onChange={(e) => setName(e.target.value)} />
              <button type="button" onClick={saveProfile}>Save profile</button>
            </div>
            {msg.err && <p className="err">{msg.err}</p>}
            {msg.note && <p className="note">{msg.note}</p>}
          </div>
        )}
      </Menu>
    </fieldset>
  );
}
