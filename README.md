# AppJet Forge

A **2D game engine and editor that runs entirely in the browser** — a Construct/GDevelop-style
event sheet, a Godot-style scene tree and behaviors, and a live canvas viewport, all in plain
ES modules with **no build step and no runtime dependencies**.

![stack](https://img.shields.io/badge/stack-vanilla_ES_modules-38bdf8) ![deps](https://img.shields.io/badge/runtime_deps-0-22c55e) ![tests](https://img.shields.io/badge/tests-52-22c55e)

---

## Quick start

```bash
npm start          # zero-dependency static server on http://localhost:3000
# or
npx serve .        # any static file server works
```

> The editor loads ES modules, so open it over `http(s)://` — **not** `file://`.

The demo project (**Coin Runner**) loads on first run. Press **▶ Play** (or `F5`) to run it,
move with `←` `→` / `A` `D`, jump with `↑` / `W` / `Space`, collect the coins, and `Esc` to stop.

---

## What's in the box

| Area | What you get |
| --- | --- |
| **Scene tree** | Nested nodes, per-node visibility toggle, inline rename (double-click), duplicate, delete, drag-free reordering via inspector parent field |
| **Canvas viewport** | Stage guides + grid, pan (`Alt`/middle drag), wheel zoom, fit-to-view, drag to move, arrow-key nudge, selection outline |
| **Inspector** | Schema-driven fields (number / text / bool / color / select / node picker / asset picker), behaviors list, per-node script editor |
| **Event sheets** | Construct-style rows: *trigger → conditions → actions*, fully data-driven, reorderable, enable/disable per event |
| **Behaviors** | 14 ready-made behaviors (platformer, 8-direction, follow, patrol, bullet, rotate, sine float, bounce, collectible, drag, wrap, lifetime, hit flash) |
| **Variables** | Per-scene variables with defaults, referenced live by events and HUD text |
| **Assets** | Image library (upload / drag & drop) stored as data URLs inside the project, usable by Sprite nodes |
| **Play mode** | Same renderer as the editor, real game loop (fixed-step accumulator), AABB physics, camera follow, input, sound via WebAudio |
| **Persistence** | Auto-save to `localStorage`, `Export`/`Import` project JSON, full undo/redo history |
| **Console** | Shared log bus for editor messages, event logs (`Log message` action) and script errors |

---

## Editor tour

```
┌──────────────────────────────────────────────────────────────────────────┐
│ New Save Export Import │ ↺ ↻ │ ▶ Play ■ Stop │ Grid Snap Fit 100%       │
├───────────────┬──────────────────────────────────────┬───────────────────┤
│ Scenes        │            Stage / viewport          │  Inspector        │
│ Hierarchy     ├──────────────────────────────────────┤  Transform        │
│  ├ Platforms  │  Events │ Variables │ Assets │ Log   │  Behaviors        │
│  ├ Player     │  ┌─────────────────────────────────┐ │  Script           │
│  └ Camera     │  │ On key pressed  [Left]          │ │                   │
│               │  │   → Set velocity Player -220 0  │ │                   │
└───────────────┴───┴─────────────────────────────────┴───────────────────┘
```

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + Z` / `Ctrl/Cmd + Shift + Z` | Undo / redo (`Ctrl + Y` also redoes) |
| `Ctrl/Cmd + S` | Save to browser storage |
| `Ctrl/Cmd + D` | Duplicate selected node |
| `Delete` / `Backspace` | Delete selected node |
| `Arrow keys` (`Shift` = 10px) | Nudge selected node |
| `F5` | Play / stop |
| `Esc` | Stop playing |

Editing shortcuts (undo, duplicate, delete, nudge) are ignored while the game is playing so the
live scene can't change underneath the player; `Ctrl/Cmd + S` still saves.

---

## Node types

| Type | Purpose | Notable fields |
| --- | --- | --- |
| **Group** | Container, moves its children | transform, visible |
| **Rectangle** | Platforms, walls, UI panels | w, h, color, opacity, solid |
| **Circle** | Coins, balls, bullets | w, h, color, opacity, solid |
| **Sprite** | Image from the asset library | asset, w, h, fallback color |
| **Text** | Labels and HUD | text, font size, color |
| **Camera** | Follows a node, sets play zoom | follow, zoom, smoothing |

All nodes share a transform (`x`, `y`, `rotation`, `scaleX`, `scaleY`), `visible`, `tags`
(comma separated, used by behaviors and conditions) and an optional `script`.

Coordinates are **parent relative**: moving a Group moves every child, and a child inside a
non-uniformly scaled parent is scaled with it — the same mental model as Godot's `Node2D` tree.

---

## Behaviors

Attach from *Inspector → Behaviors → + Add behavior*. Behaviors are just data (`src/schema.js`)
plus a handler in the runtime, so they compose freely.

| Behavior | Effect |
| --- | --- |
| Platformer | Gravity, left/right run, jump; collides with `solid` nodes |
| 8-Direction | Arrow/WASD movement, no gravity |
| Follow | Smoothly trails another node with an offset |
| Patrol | Back-and-forth along X or Y |
| Bullet | Constant velocity, dies on solids or off-stage |
| Rotate | Spins at N°/sec |
| Float (Sine) | Bobs along an axis around its spawn point |
| Bounce | Reflects off the stage edges |
| Collectible | Adds to a scene variable when a tagged node touches it, then destroys itself |
| Drag with mouse | Click-drag the node during play |
| Wrap around | Re-enters from the opposite edge |
| Lifetime | Destroys itself after N seconds |
| Hit flash | Blinks when an event damages/pushes it |

---

## Event sheets

An event is **one trigger**, any number of **conditions**, and any number of **actions**.
Every row is evaluated by the runtime each frame with the editor's own data.

**Triggers** — On start of scene, Every frame, While key is held, On key pressed,
On click node, On collision (A vs B), Every N seconds.

**Conditions** — Variable compare (`== != > < >= <=`), Key is held, Node exists,
Node is visible, Distance between nodes, Random chance %.

**Actions** — Set variable, Add to variable, Set position, Move by, Set velocity, Destroy node,
Spawn node, Set visibility, Set color, Set text, Go to scene, Play tone, Log message.

Action values support `{variable}` interpolation, e.g. `Set text HUD` → `Score {score}`.

---

## Scripting

Each node can carry a script (Inspector → **Script**). Scripts run in a sandboxed function with a
small API and may define lifecycle hooks:

```js
function onStart(node, api) {
  api.log('ready: ' + node.name);
}

function onUpdate(node, api, dt) {
  node.rotation += 45 * dt;
  if (api.getVar('score') >= 30) api.log('you win!');
}
```

Available on `api`: `node`/`find(name)`, `spawn`, `destroy`, `getVar`, `setVar`,
`addVar`, `keyDown`, `keyPressed`, `mouse`, `camera`, `log`, `tone`, `scene`.
Errors are caught and reported to the console panel instead of breaking the loop.

---

## Project format

Projects are plain JSON — the same document that `Export` writes and `Import` validates:

```json
{
  "name": "Coin Runner",
  "version": 1,
  "settings": { "grid": 20, "showGrid": true, "snap": false },
  "assets": { "a1": { "name": "hero.png", "dataUrl": "data:image/png;base64,..." } },
  "scenes": [
    {
      "id": "sc_1", "name": "Level 1", "width": 960, "height": 540, "bg": "#0b1020",
      "vars": { "score": 0, "health": 3 },
      "nodes": [
        {
          "id": "n_1", "type": "rect", "name": "Player",
          "x": 120, "y": 449, "w": 34, "h": 42, "color": "#f59e0b", "tags": "player",
          "behaviors": [{ "type": "platformer", "speed": 240, "jump": 560, "gravity": 1750 }],
          "script": "", "children": []
        }
      ],
      "events": [
        {
          "id": "ev_1", "enabled": true,
          "trigger": "keyPressed", "triggerParams": { "key": "ArrowLeft" },
          "conditions": [],
          "actions": [{ "id": "a1", "type": "setVelocity", "params": { "node": "Player", "vx": -220, "vy": 0 } }]
        }
      ]
    }
  ]
}
```

Import is forgiving: unknown node types fall back to rectangles, unknown behaviors are dropped,
missing numeric fields get sane defaults, and a project with no scenes is rejected with a clear
message. `Clone`, `duplicate` and `add scene` all regenerate IDs so references never collide.

---

## Architecture

```
index.html              editor shell (grid layout, dock tabs, modal root)
styles/editor.css       dark IDE theme, zero frameworks
server.js               dependency-free static server (0.0.0.0:$PORT)
src/
  util.js               tiny DOM builder (el), clone/uid/clamp helpers
  schema.js             ALL node types, behaviors, triggers, conditions, actions (data)
  project.js            pure model: create/normalize/find/move/duplicate + VERSION
  store.js              reactive store, undo/redo history, localStorage, scenes
  render.js             scene flattening (world transforms) + canvas drawing
  runtime.js            game loop, fixed-step physics, behaviors, camera, scripts, events
  images.js             HTMLImage cache for asset data URLs
  console.js            log bus shared by editor + runtime
  demo.js               the bundled Coin Runner project
  editor/
    app.js              bootstrap, toolbars, play mode, shortcuts, modals
    tree.js             hierarchy panel
    inspector.js        schema-driven property editor + behaviors + script
    viewport.js         canvas pan/zoom/selection/drag, stage HUD
    eventsheet.js       event row UI
    vars.js             scene variables panel
    assets.js           asset library panel
    consolepanel.js     log console
    fields.js           shared field widgets
tests/                  node:test suites (model, schema, runtime, jsdom UI smoke)
```

**Why no build step?** Everything is a native ES module, so the editor is instantly editable,
loads fast on any static host, and the runtime can be unit-tested under Node with a stub canvas.

The model layer (`project.js`, `schema.js`, `store.js`, `render.js`, `runtime.js`) never touches
the DOM, which is what makes the 52 tests runnable without a browser.

---

## Testing

```bash
npm test                                   # node --test tests/
node --test tests/runtime.test.js          # one suite
```

* `tests/project.test.js` — model, normalization, ID regeneration, tree moves
* `tests/schema.test.js` — registry integrity and parameter defaults
* `tests/runtime.test.js` — game loop, physics, behaviors, event evaluation, scripting
* `tests/ui.smoke.test.js` — boots the whole editor in `jsdom` (`npm install` first) and drives
  real clicks: select → inspect, undo/redo, add node/event/scene, play/stop, export/import

---

## Deployment

```bash
docker build -t appjet-forge .
docker run -p 3000:3000 appjet-forge
```

The `Dockerfile` copies the static files and runs `server.js`, which binds `0.0.0.0` and reads
`process.env.PORT` (default `3000`). Any static host (Netlify, S3, GitHub Pages, nginx) works too —
only `index.html`, `styles/` and `src/` are required.

---

## Extending the engine

Adding a capability is mostly a data edit:

1. **New node type** — add an entry to `NODE_TYPES` in `src/schema.js` (label, icon, defaults,
   fields) and add it to `NODE_TYPE_ORDER`; the picker, inspector and tree pick it up
   automatically. Render it in `drawInstances` (`src/render.js`) if it needs custom drawing.
2. **New behavior** — add to `BEHAVIORS` (fields + defaults) and write its `case` in
   `runBehaviors` (`src/runtime.js`).
3. **New trigger / condition / action** — add to `TRIGGERS` / `CONDITIONS` / `ACTIONS`, then
   handle it in `runEvents` / `checkCondition` / `runAction` (`src/runtime.js`). Fields are
   rendered from your declaration, so no UI work is needed.

---

## Known limitations

* 2D only, axis-aligned collision boxes (no rotated-box or polygon collision).
* Text is drawn with the system font — no bitmap font pipeline yet.
* Scripts are `new Function` sandboxed by convention, not a security boundary; don't load
  untrusted project files from sources you don't trust.
* Audio is limited to `Play tone` (WebAudio oscillator); there is no sound asset pipeline.
* Assets are stored as data URLs in the project JSON, so very large images make exports heavy.

## License

MIT
