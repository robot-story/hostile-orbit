# HOSTILE ORBIT

Neon military sci-fi third-person shooter in the browser. Two operations: drop onto the canyon blacksite of Khepri-9 (Silent Meridian) or the neon colony city on the dark moon Erebus (Black Lantern) as a disposable Meridian Commonwealth Vanguard, cut the Null Legion's signal, take their data, rescue two prisoners if you feel like it, survive extraction, and put down the Warden. Solo or three-player online co-op. Pick the operation on the war table.

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
| Tactical map (live pins; also the TAC MAP button on the HUD) | M |
| Dev menu (toggles, cheats, stage skip) | F9 |
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

Testing switches: god mode and all four orbital abilities are on by default (dev menu F9; F10 toggles god mode, `?mortal` disables it at start).

Custom characters: drop Meshy-style GLBs into `public/models/` (`vanguard.glb` for the player, `sentinel.glb` for the Legion rifleman, its rifle meshes drive the Viper and Longshot). Static character sheets are split and auto-skinned to the procedural skeleton at load; see `src/models/glbSoldier.js`.

Deploy: `bash tools/deploy.sh` (builds, verifies, pushes `dist/` to `gh-pages` through a worktree).
