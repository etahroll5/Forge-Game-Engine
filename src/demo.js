// ============================================================================
// Default demo project — a tiny platformer that shows off behaviors, the event
// sheet, hierarchy groups and multi-scene switching out of the box.
// ============================================================================

import { createProject, createScene, createNode, addBehavior, insertNode } from './project.js';

function node(type, props, behaviors = []) {
  const n = createNode(type, props);
  for (const [behavior, p] of behaviors) {
    Object.assign(addBehavior(n, behavior), p || {});
  }
  return n;
}

export function defaultProject() {
  const project = createProject('Coin Runner');
  project.settings.grid = 20;

  // ---------------------------------------------------------------- Level 1
  const level = project.scenes[0];
  level.name = 'Level 1';
  level.width = 960;
  level.height = 540;
  level.bg = '#0b1020';
  level.vars = { score: 0, health: 3 };

  // Platforms live inside a group so moving one node moves them all.
  const platforms = node('group', { name: 'Platforms', x: 0, y: 0 });
  platforms.children.push(
    node('rect', { name: 'Platform A', x: 280, y: 380, w: 200, h: 22, color: '#2b4a6f', solid: true }),
    node('rect', { name: 'Platform B', x: 660, y: 290, w: 170, h: 22, color: '#2b4a6f', solid: true }),
    node('rect', { name: 'Platform C', x: 470, y: 200, w: 130, h: 22, color: '#2b4a6f', solid: true }),
  );
  insertNode(level, platforms);
  insertNode(level, node('rect', { name: 'Ground', x: 480, y: 505, w: 960, h: 70, color: '#143049', solid: true }));

  insertNode(
    level,
    node(
      'rect',
      { name: 'Player', x: 120, y: 430, w: 34, h: 42, color: '#f59e0b', tags: 'player' },
      [['platformer', { speed: 240, jump: 560, gravity: 1750 }]],
    ),
  );

  const coinSpots = [
    [280, 330],
    [660, 240],
    [470, 150],
  ];
  coinSpots.forEach(([x, y], i) => {
    insertNode(
      level,
      node(
        'circle',
        { name: `Coin ${i + 1}`, x, y, w: 22, h: 22, color: '#fde047', tags: 'coin' },
        [['collectible', { tag: 'player', variable: 'score', value: 10 }], ['sine', { axis: 'y', amplitude: 6, frequency: 0.9, phase: i }]],
      ),
    );
  });

  insertNode(
    level,
    node(
      'circle',
      { name: 'Blob', x: 560, y: 470, w: 32, h: 32, color: '#f472b6', tags: 'enemy' },
      [['patrol', { axis: 'x', distance: 130, speed: 110 }], ['sine', { axis: 'y', amplitude: 4, frequency: 3 }]],
    ),
  );

  insertNode(level, node('text', { name: 'HUD', x: 150, y: 40, text: 'Score 0', fontSize: 22, color: '#93c5fd' }));
  insertNode(level, node('camera', { name: 'Camera', x: 480, y: 270, follow: 'Player', zoom: 1.45, smoothing: 0.12 }));

  level.events = [
    {
      id: 'ev_start',
      enabled: true,
      trigger: 'start',
      triggerParams: {},
      conditions: [],
      actions: [{ id: 'a1', type: 'log', params: { message: 'Collect 3 coins with the arrow keys!' } }],
    },
    {
      id: 'ev_hud',
      enabled: true,
      trigger: 'timer',
      triggerParams: { interval: 0.2 },
      conditions: [],
      actions: [{ id: 'a2', type: 'setText', params: { node: 'HUD', text: 'Score {score}   Health {health}' } }],
    },
    {
      id: 'ev_hurt',
      enabled: true,
      trigger: 'collide',
      triggerParams: { a: 'Player', b: 'Blob' },
      conditions: [],
      actions: [
        { id: 'a3', type: 'addVar', params: { name: 'health', value: -1 } },
        { id: 'a4', type: 'setPos', params: { node: 'Player', x: 120, y: 430 } },
        { id: 'a5', type: 'playTone', params: { freq: 220, duration: 0.14 } },
      ],
    },
    {
      id: 'ev_win',
      enabled: true,
      trigger: 'timer',
      triggerParams: { interval: 1 },
      conditions: [{ id: 'c1', type: 'variable', params: { name: 'score', op: '>=', value: '30' } }],
      actions: [{ id: 'a6', type: 'log', params: { message: 'All coins collected — score {score}!' } }],
    },
    {
      id: 'ev_scene',
      enabled: true,
      trigger: 'keyPressed',
      triggerParams: { key: 'Enter' },
      conditions: [],
      actions: [{ id: 'a7', type: 'switchScene', params: { scene: 'Space' } }],
    },
  ];

  // ---------------------------------------------------------------- Level 2
  const space = createScene('Space');
  space.width = 800;
  space.height = 520;
  space.bg = '#120b22';
  space.vars = { bounces: 0 };
  space.nodes = [
    node('rect', { name: 'Backdrop', x: 400, y: 260, w: 800, h: 520, color: '#1b1230' }),
    node('text', { name: 'Title', x: 400, y: 90, text: 'Scene 2 — press Enter to go back', fontSize: 20, color: '#c4b5fd' }),
    node(
      'circle',
      { name: 'Orb', x: 200, y: 200, w: 46, h: 46, color: '#a78bfa' },
      [['bounce', { speedX: 260, speedY: 200 }], ['rotate', { speed: 120 }]],
    ),
    node('circle', { name: 'Star A', x: 600, y: 320, w: 18, h: 18, color: '#fde047' }, [['sine', { axis: 'y', amplitude: 24, frequency: 0.8 }]]),
    node('rect', { name: 'Pad', x: 400, y: 470, w: 220, h: 18, color: '#38bdf8', solid: true }),
  ];
  space.events = [
    {
      id: 'ev_space_enter',
      enabled: true,
      trigger: 'keyPressed',
      triggerParams: { key: 'Enter' },
      conditions: [],
      actions: [{ id: 'b1', type: 'switchScene', params: { scene: 'Level 1' } }],
    },
    {
      id: 'ev_space_start',
      enabled: true,
      trigger: 'start',
      triggerParams: {},
      conditions: [],
      actions: [{ id: 'b2', type: 'log', params: { message: 'Scene switching works — welcome to Space.' } }],
    },
  ];

  project.scenes.push(space);
  return project;
}
