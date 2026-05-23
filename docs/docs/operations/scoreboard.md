# Scoreboard & theme

Two small pieces that turn the backend from a flag-vending machine
into something an audience can watch.

## /api/scoreboard

Public, no auth. Read-only. Aggregates the in-memory solve tracker
into per-challenge counters and first-blood timestamps.

```bash
curl -s "$BACKEND/api/scoreboard" | jq
```

```json
{
  "generatedAt": 1716480000,
  "board": {
    "sigreplay": {
      "solveCount": 12,
      "currentlySolved": 12,
      "firstBlood": { "player": "0xfeed…cafe", "ts": 1716475200 },
      "solves": [
        { "player": "0xfeed…cafe", "ts": 1716475200, "current": true },
        { "player": "0xdead…beef", "ts": 1716475260, "current": true }
      ]
    },
    "kothfk": {
      "solveCount": 5,
      "currentlySolved": 1,
      "firstBlood": { "player": "0xa11ce…", "ts": 1716476000 },
      "solves": [ … ]
    }
  }
}
```

Notes:

- The bundled frontend renders a collapsible **Scoreboard** widget at
  the top of the page that polls this endpoint every 15s.
- KOTH-shaped challenges show `currentlySolved < solveCount` — that's
  the delta between "ever solved" and "currently sitting on the
  throne".
- First-blood is sticky: once recorded, it survives later down→up
  flips, so a dethroned-then-recrowned player doesn't reset the prize.
- State lives in process memory; a backend restart resets the board.
  For permanent records, ingest `solve.first` webhooks into your
  scoreboard service of choice ([webhooks](webhook.md)).

## Theme override slot

`frontend/index.html` references `./theme.css` after the bundled
`style.css`. If it exists, every rule in it wins; if not, it 404s
silently (the `<link onerror>` removes the tag).

To rebrand without forking the stylesheet:

```bash
cp frontend/theme.css.example frontend/theme.css
# edit the :root variables and any per-element overrides
```

The bundled CSS exposes its full palette as `:root` custom properties,
so most rebrands are just:

```css
:root {
  --bg:           #0d1117;
  --surface:      #161b22;
  --text:         #c9d1d9;
  --accent:       #58a6ff;
  --success:      #56d364;
  --danger:       #f85149;
  /* ...etc */
}
```

The example file ships a working dark theme you can adapt. In docker
compose mode the file is part of the static frontend image; rebuild
the frontend container after editing (`just rebuild-frontend`). In
bare-metal mode (`FRONTEND_PATH=...`) just edit + refresh the browser.

## Embedding the scoreboard elsewhere

Since the endpoint is public and the schema is small, any audience-
facing display (Twitch overlay, lobby screen, Slack bot) can poll it
directly:

```js
const r = await fetch("https://ctf.example.com/api/scoreboard");
const { board } = await r.json();
for (const [chId, row] of Object.entries(board)) {
  console.log(chId, row.currentlySolved, "/", row.solveCount,
              row.firstBlood ? `🩸 ${row.firstBlood.player.slice(0,10)}…` : "");
}
```

CORS is set to `*` by default; if you've locked it down, add your
display's origin to `CORS_ORIGIN`.
