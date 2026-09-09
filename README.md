# HOSTILE ORBIT

Neon military sci-fi third-person shooter in the browser. Drop onto Khepri-9 as a disposable Meridian Commonwealth Vanguard, destroy the Null Legion jammer, steal the invasion data, rescue two operatives if you feel like it, survive extraction, and put down the Warden. Solo or three-player online co-op.

**Play:** https://robot-story.github.io/hostile-orbit/

## Controls

| Action | Key |
| --- | --- |
| Move / run | W A S D |
| Sprint | Shift |
| Aim (scope on the Longshot) | Right mouse |
| Fire | Left mouse |
| Reload | R |
| Crouch (toggle) | C |
| Take cover / vault / leave cover | Space |
| Combat roll (i-frames) | X or Left Alt |
| Grenade (hold to throw further) | G |
| Wellness injector | H |
| Interact / plant / download / board | E (hold) |
| Swap weapon | Tab or mouse wheel |
| Switch shoulder | Q |
| Orbital abilities (after the jammer falls) | 1 Kinetic Strike, 2 Gunship Run, 3 Sentry Pod, 4 Supply Pod |
| Tactical map | M |
| Pause | Escape |

## Co-op

1. Main menu → **MULTIPLAYER** → enter a name → **HOST LOBBY**.
2. Copy the invite link (or read out the 6-character room code) and send it to a friend.
3. The friend opens the link, picks a name and lands in the lobby automatically. Everyone presses **READY**.
4. Host: **BEGIN DEPLOYMENT** → **DEPLOY**. Everyone drops in their own pod.

Connections are peer-to-peer WebRTC via the public PeerJS signalling server; the host is authoritative for enemies, damage, objectives and the shared reinforcement pool. Friendly fire is on at reduced damage. Reconnecting with the same name through the same link restores the slot while the host stays in the lobby.

## Development

```
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/
npm run gen:audio  # procedural SFX + music -> public/audio
npm run gen:voice  # OpenAI TTS voice lines -> public/audio/vo (needs OPENAI_API_KEY)
node tools/generate-images.mjs [--edits]   # menu backdrops (needs OPENAI_API_KEY)
```

The OpenAI key is only ever used by the `tools/` scripts at build time. Nothing in `src/` or `public/` touches it.

Testing switches: god mode is on by default for now (F10 toggles, `?mortal` disables at start).

Deploy: `bash tools/deploy.sh` (builds, verifies, pushes `dist/` to `gh-pages` through a worktree).
