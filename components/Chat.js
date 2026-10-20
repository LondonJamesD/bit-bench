'use client';
import { useEffect, useRef, useState } from 'react';

export default function Chat({ messages, myId, onSend }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function submit(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  }

  return (
    <section className="panel chat">
      <h2>Chat</h2>
      <div className="chat-list" ref={listRef} aria-live="polite">
        {messages.length === 0 && <p className="hint">No messages yet. Say hi.</p>}
        {messages.map((m) =>
          m.system ? (
            <p key={m.id} className="sys">{m.text}</p>
          ) : (
            <p key={m.id} className={`msg ${m.color}`}>
              <b className="who">{m.from === myId ? 'You' : m.name}</b> {m.text}
            </p>
          )
        )}
      </div>
      <form className="row" onSubmit={submit} autoComplete="off">
        <input type="text" id="chat-input" aria-label="Chat message" placeholder="Message" maxLength={300}
          value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit">Send</button>
      </form>
    </section>
  );
}
