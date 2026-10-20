# Bit Bench

A round-based game for practising binary: conversions, 1- and 2-step arithmetic (+ − × ÷), finding a missing operand, and two's complement. Play alone, or in 2–4 player showdowns over a peer-to-peer connection.

## Deploy to Vercel

1. Put this folder in a GitHub repository (or GitLab/Bitbucket).
2. On vercel.com choose **Add New → Project**, import the repository and press **Deploy**. Vercel detects Next.js automatically; no settings or environment variables are needed.

Or from this folder, with the Vercel CLI:

```bash
npx vercel        # preview deployment
npx vercel --prod # production
```

## Run locally

```bash
npm install
npm run dev       # http://localhost:3000
```

Requires Node.js 18.18 or newer.

## Features

- **Solo practice** with Easy/Hard modes, adjustable register width (4–16 bits, default 8), answer format (binary, decimal or mixed), operation toggles, and a weighted round mix you can save as named profiles.
- **Showdown (multiplayer)** for 2–4 players:
  - The host creates a room and shares the 5-character code or the invite link (`/?room=CODE`).
  - Everyone gets the same question with a 3-minute limit and one locked answer.
  - Points: a correct answer is worth 1,000 at the start, falling to 100 as time runs out. The first correct answer gets +300, the second +150 and the third +50. Wrong or missing answers score 0.
  - A round ends when everyone has answered, time runs out, or a strict majority votes to skip.
  - The scoreboard shows each player's name, total, a bar against the leader, the "+points" they earned this round, and a pip per round.
  - The room has a chat window.
  - Easy or Hard mode is each player's own choice, and the lobby shows who is on which.

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
components/     UI: Solo, Multiplayer, Scoreboard, Chat, QuestionRows, AnswerBox, SettingsPanel
lib/binary.js   Question generation, answer checking, scoring (no browser APIs)
lib/host.js     Host-side match logic for multiplayer
lib/storage.js  localStorage helpers (settings, profiles, name)
```
