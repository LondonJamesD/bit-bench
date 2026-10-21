# Bit Bench

Vibecoded slop game for practicing for my midterm with friends.

A round-based game for practising binary: conversions, 1- and 2-step arithmetic (+ − × ÷), finding a missing operand, two's complement, and quick trivia (overflow checks and multiple choice). Play alone, or in 2–10 player showdowns over a peer-to-peer connection.

## Features

- **Solo practice** with Easy/Hard modes, adjustable register width (4–16 bits, default 8), answer format (binary, decimal or mixed), operation toggles, and a weighted round mix you can save as named profiles. All of it sits in three dropdowns: Difficulty, Game and Round mix.
- **Trivia rounds**, part of the round mix like any other type:
  - *Overflow or underflow?* shows a signed or unsigned add, subtract or multiply and asks whether the result overflows, underflows or fits. The reveal shows what the register actually wraps to.
  - *Multiple choice* gives four options: reading bits, writing a number in binary, reading two's complement (the wrong options are the usual misreadings), or a range fact such as the largest signed value.
  - The *Trivia blitz* preset is all trivia. Press keys 1–4 to answer.
- **Streaks**: consecutive correct answers multiply your points by ×1.25, ×1.5, ×1.75 and then ×2. A wrong or missing answer resets the streak.
- **Effects**: particle bursts on correct answers, bigger ones for the first correct answer, fireworks and confetti for the winner, chiptune music and synthesized sound effects. Music and sounds each have an on/off switch. Animations are turned off if your system asks for reduced motion.
- **Showdown (multiplayer)** for 2–10 players:
  - The host creates a room and shares the 5-character code or the invite link (`/?room=CODE`).
  - Everyone gets the same question with a 3-minute limit (30 seconds for trivia) and one locked answer.
  - Points: a correct answer is worth 1,000 at the start, falling to 100 as time runs out. The first correct answer gets +300, the second +150 and the third +50. The streak multiplier applies to the total. Wrong or missing answers score 0.
  - A round ends when everyone has answered, time runs out, or a strict majority votes to skip.
  - The scoreboard shows each player's name, total, a bar against the leader, their current streak, the "+points" they earned this round, and a pip per round.
  - The room has a chat window.
  - The host controls everything: the game settings, the round mix, and Easy or Hard mode for the whole room.

## How multiplayer works

- Players connect browser to browser over WebRTC data channels using [PeerJS](https://peerjs.com).
- The room code is the host's PeerJS id. The free PeerJS cloud server only introduces the browsers to each other; after that, game messages travel directly between players.
- The host's browser runs the match. It generates questions, checks answers and keeps score. Correct answers are never sent to other players until a round is revealed.
- **The host must keep their tab open.** If the host leaves, the room closes.
- Players can't join once a game has started. The host can return to the lobby to let new people in.

### Limitations

- Some strict networks (certain school, office or mobile carrier networks) block direct WebRTC connections. Joining will then time out.
  - The fix is a TURN relay server. Add it to the `new Peer(...)` options in `components/Multiplayer.js`, for example `{ config: { iceServers: [{ urls: 'turn:…', username: '…', credential: '…' }] } }`.
- Rooms depend on the free PeerJS cloud server being reachable. To run your own, see the PeerJS Server docs and pass `host`/`port`/`path` in the same options.

## Project layout

```
app/            Next.js App Router entry (layout, page, global styles)
components/     UI: Solo, Multiplayer, Scoreboard, Chat, QuestionRows, AnswerBox, SettingsPanel, Menu, SoundToggles
lib/binary.js   Question generation, answer checking, scoring (no browser APIs)
lib/host.js     Host-side match logic for multiplayer
lib/audio.js    Music playback and synthesized sound effects
lib/fx.js       Canvas particles (bursts, fireworks, confetti)
lib/storage.js  localStorage helpers (settings, profiles, name, sound switches)
public/audio/   Music tracks
```

## Credits

Music is from the [Retro Game Music Pack by Juhani Junkala](https://opengameart.org/content/5-chiptunes-action), released under CC0 (public domain). The tracks were converted to mono MP3: `lobby.mp3` (Title Screen), `round.mp3` (Level 1), `trivia.mp3` (Level 2) and `victory.mp3` (Ending).
