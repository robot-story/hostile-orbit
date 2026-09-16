# Original character backup

Saved before the Mk III integration on 14 September 2026. Contains the complete original `src` tree, original character textures, original GLBs and package.json. The manifest records SHA-256 hashes for the integration files and character assets needed for restoration.

For an immediate side-by-side preview without changing files, open http://localhost:5173/?robotlab&characters=legacy. The legacy OUTRIDER builder and weapon builders remain available in the game as `?characters=legacy`.

From the HOSTILE ORBIT directory:

```powershell
node tools/restore-characters.mjs
node tools/restore-characters.mjs --apply
npm run build
```

The first command verifies the archive and previews restoration. The second first saves the current affected files into a new dated backup, then restores the original files. It does not delete unrelated work or the new Mk III source. Restoring the animation and integration files also reverts later edits to those files; those edits remain in the dated safety backup.
