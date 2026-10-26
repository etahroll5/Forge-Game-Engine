// Runtime/gameplay tests. The engine is constructed with a stub canvas so the
// simulation (physics, behaviors, event sheet) can be exercised under Node
// without a DOM.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Engine, compare } from '../src/runtime.js';
import { flatten, halfExtents, worldAABB, overlaps } from '../src/render.js';
import { createScene, createNode, addBehavior } from '../src/project.js';
import { defaultProject } from '../src/demo.js';

function stubCanvas() {
  return {
    width: 960,
    height: 540,
    getContext: () => ({}),
    getBoundingClientRect: () => ({ width: 960, height: 540, left: 0, top: 0 }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

function sceneWith(nodes, extra = {}) {
  const scene = createScene('Test');
  scene.width = 960;
  scene.height = 540;
  scene.nodes = nodes;
  Object.assign(scene, extra);
  return scene;
}

function makeEngine(scene) {
  const engine = new Engine({ project: { assets: {} }, scene, canvas: stubCanvas() });
  engine.build();
  return engine;
}

function platformer(name, x, y, w = 34, h = 42) {
  const node = createNode('rect', { name, x, y, w, h, tags: 'player' });
  addBehavior(node, 'platformer');
  return node;
}

function solidGround() {
  return createNode('rect', { name: 'Ground', x: 480, y: 505, w: 960, h: 70, solid: true });
}

// ------------------------------------------------------------------ helpers
test('compare handles numbers and strings', () => {
  assert.equal(compare(5, 5, '=='), true);
  assert.equal(compare('5', 5, '=='), true);
  assert.equal(compare(4, 5, '<'), true);
  assert.equal(compare(5, 5, '>'), false);
  assert.equal(compare(5, 5, '>='), true);
  assert.equal(compare('a', 'a', '=='), true);
  assert.equal(compare('a', 'b', '!='), true);
  assert.equal(compare('a', 'b', '>'), false);
});

test('flatten resolves world transforms through scale', () => {
  const group = createNode('group', { name: 'G', x: 100, y: 50, scaleX: 2, scaleY: 2 });
  const child = createNode('rect', { name: 'C', x: 10, y: 10, w: 20, h: 20 });
  group.children.push(child);
  const scene = sceneWith([group]);
  const list = flatten(scene);
  assert.equal(list.length, 2);
  assert.equal(list[0].wx, 100);
  assert.equal(list[1].wx, 120); // 100 + 10*2
  assert.equal(list[1].wsx, 2);
  const he = halfExtents(list[1]);
  assert.equal(he.hw, 20); // 20 * 2 / 2
});

test('overlaps detects AABB intersection', () => {
  const scene = sceneWith([
    createNode('rect', { name: 'A', x: 100, y: 100, w: 50, h: 50 }),
    createNode('rect', { name: 'B', x: 120, y: 120, w: 50, h: 50 }),
    createNode('rect', { name: 'C', x: 400, y: 400, w: 50, h: 50 }),
  ]);
  const [a, b, c] = flatten(scene);
  assert.equal(overlaps(a, b), true);
  assert.equal(overlaps(a, c), false);
  const box = worldAABB(a);
  assert.equal(box.l, 75);
  assert.equal(box.r, 125);
});

// ------------------------------------------------------------------ physics
test('platformer falls under gravity and lands on a solid', () => {
  const player = platformer('Player', 480, 100, 34, 42);
  const engine = makeEngine(sceneWith([solidGround(), player]));
  for (let i = 0; i < 240; i += 1) engine.runBehaviors(1 / 60);
  const p = engine.find('Player');
  // Ground top = 505 - 35 = 470; player half height = 21 → rest at 449.
  assert.ok(Math.abs(p.wy - 449) < 1.5, `expected rest y≈449, got ${p.wy}`);
  assert.ok(Math.abs(p.vy) < 60, 'vertical velocity should settle near zero');
});

test('platformer responds to the right arrow key', () => {
  const player = platformer('Player', 200, 470, 34, 42);
  const engine = makeEngine(sceneWith([solidGround(), player]));
  engine.keys.add('ArrowRight');
  const startX = engine.find('Player').wx;
  for (let i = 0; i < 30; i += 1) engine.runBehaviors(1 / 60);
  const moved = engine.find('Player').wx;
  assert.ok(moved > startX + 40, `expected movement, went from ${startX} to ${moved}`);
});

test('topdown behavior moves on both axes', () => {
  const node = createNode('circle', { name: 'Blob', x: 200, y: 200, w: 20, h: 20 });
  addBehavior(node, 'topdown');
  const engine = makeEngine(sceneWith([node]));
  engine.keys.add('ArrowDown');
  for (let i = 0; i < 30; i += 1) engine.runBehaviors(1 / 60);
  assert.ok(engine.find('Blob').wy > 200);
});

test('bullet is destroyed after leaving the stage', () => {
  const node = createNode('circle', { name: 'Shot', x: 100, y: 200, w: 12, h: 12 });
  Object.assign(addBehavior(node, 'bullet'), { speedX: 900 });
  const engine = makeEngine(sceneWith([node]));
  for (let i = 0; i < 120; i += 1) engine.runBehaviors(1 / 60);
  assert.equal(engine.find('Shot'), null, 'bullet should be destroyed off-stage');
});

test('collectible adds to a variable when touched', () => {
  const player = createNode('rect', { name: 'Player', x: 100, y: 100, w: 40, h: 40, tags: 'player' });
  const coin = createNode('circle', { name: 'Coin', x: 100, y: 100, w: 20, h: 20 });
  addBehavior(coin, 'collectible');
  const engine = makeEngine(sceneWith([player, coin], { vars: { score: 0 } }));
  engine.runBehaviors(1 / 60);
  assert.equal(engine.vars.score, 10);
  assert.equal(engine.find('Coin'), null);
});

test('sine behavior offsets from the spawn point', () => {
  const star = createNode('circle', { name: 'Star', x: 300, y: 300, w: 10, h: 10 });
  Object.assign(addBehavior(star, 'sine'), { amplitude: 40, frequency: 0.5 });
  const engine = makeEngine(sceneWith([star]));
  for (let i = 0; i < 30; i += 1) engine.runBehaviors(1 / 60);
  const y = engine.find('Star').wy;
  assert.ok(y !== 300, 'expected the node to move');
  assert.ok(Math.abs(y - 300) <= 41, 'movement must stay within the amplitude');
});

// --------------------------------------------------------------- event sheet
test('start / tick events with conditions and actions', () => {
  const engine = makeEngine(
    sceneWith([], {
      vars: { score: 0 },
      events: [
        { id: 'e1', enabled: true, trigger: 'start', triggerParams: {}, conditions: [], actions: [{ type: 'setVar', params: { name: 'score', value: '5' } }] },
        {
          id: 'e2',
          enabled: true,
          trigger: 'tick',
          triggerParams: {},
          conditions: [{ id: 'c1', type: 'variable', params: { name: 'score', op: '>=', value: '5' } }],
          actions: [{ type: 'addVar', params: { name: 'score', value: 1 } }],
        },
      ],
    }),
  );

  engine.frame = 0;
  engine.runEvents(1 / 60);
  assert.equal(engine.vars.score, 6, 'start set 5 then tick added 1');

  engine.frame = 1;
  engine.runEvents(1 / 60);
  assert.equal(engine.vars.score, 7, 'start must only fire once');
});

test('disabled events and failing conditions do not run', () => {
  const engine = makeEngine(
    sceneWith([], {
      vars: { score: 0 },
      events: [
        { id: 'e1', enabled: false, trigger: 'tick', triggerParams: {}, conditions: [], actions: [{ type: 'addVar', params: { name: 'score', value: 1 } }] },
        {
          id: 'e2',
          enabled: true,
          trigger: 'tick',
          triggerParams: {},
          conditions: [{ id: 'c1', type: 'variable', params: { name: 'score', op: '>=', value: '99' } }],
          actions: [{ type: 'addVar', params: { name: 'score', value: 1 } }],
        },
      ],
    }),
  );
  engine.runEvents(1 / 60);
  assert.equal(engine.vars.score, 0);
});

test('timer trigger respects its interval', () => {
  const engine = makeEngine(
    sceneWith([], {
      vars: { ticks: 0 },
      events: [
        { id: 'e1', enabled: true, trigger: 'timer', triggerParams: { interval: 0.5 }, conditions: [], actions: [{ type: 'addVar', params: { name: 'ticks', value: 1 } }] },
      ],
    }),
  );
  for (let i = 0; i < 30; i += 1) engine.runEvents(1 / 60); // 0.5s
  assert.equal(engine.vars.ticks, 1);
  for (let i = 0; i < 30; i += 1) engine.runEvents(1 / 60);
  assert.equal(engine.vars.ticks, 2);
});

test('key and click triggers fire', () => {
  const engine = makeEngine(
    sceneWith([], {
      vars: { hits: 0 },
      events: [
        { id: 'e1', enabled: true, trigger: 'keyPressed', triggerParams: { key: 'Space' }, conditions: [], actions: [{ type: 'addVar', params: { name: 'hits', value: 1 } }] },
        { id: 'e2', enabled: true, trigger: 'click', triggerParams: { node: 'Ball' }, conditions: [], actions: [{ type: 'addVar', params: { name: 'hits', value: 10 } }] },
      ],
    }),
  );
  engine.keys.add('Space');
  engine.runEvents(1 / 60);
  assert.equal(engine.vars.hits, 1);

  // held key must not retrigger
  engine.prevKeys.add('Space');
  engine.runEvents(1 / 60);
  assert.equal(engine.vars.hits, 1);

  engine.clicks.push({ x: 0, y: 0, names: ['Ball'] });
  engine.runEvents(1 / 60);
  assert.equal(engine.vars.hits, 11);
});

test('collide trigger and destroy/spawn actions', () => {
  const a = createNode('rect', { name: 'A', x: 100, y: 100, w: 50, h: 50 });
  const b = createNode('rect', { name: 'B', x: 110, y: 110, w: 50, h: 50 });
  const engine = makeEngine(
    sceneWith([a, b], {
      events: [
        {
          id: 'e1',
          enabled: true,
          trigger: 'collide',
          triggerParams: { a: 'A', b: 'B' },
          conditions: [],
          actions: [
            { type: 'setColor', params: { node: 'B', color: '#ff0000' } },
            { type: 'spawn', params: { type: 'circle', name: 'Burst', x: 200, y: 200 } },
            { type: 'log', params: { message: 'hit' } },
          ],
        },
      ],
    }),
  );
  engine.runEvents(1 / 60);
  assert.equal(engine.find('B').def.color, '#ff0000');
  assert.ok(engine.find('Burst'), 'spawn action should create a node');
});

test('setText interpolates variables', () => {
  const hud = createNode('text', { name: 'HUD', x: 10, y: 10, text: 'Score 0' });
  const engine = makeEngine(
    sceneWith([hud], {
      vars: { score: 7 },
      events: [
        { id: 'e1', enabled: true, trigger: 'tick', triggerParams: {}, conditions: [], actions: [{ type: 'setText', params: { node: 'HUD', text: 'Score {score}' } }] },
      ],
    }),
  );
  engine.runEvents(1 / 60);
  assert.equal(engine.find('HUD').def.text, 'Score 7');
  assert.equal(engine.interpolate('{missing} / {score}'), '{missing} / 7');
});

test('destroy removes the node from lookups', () => {
  const a = createNode('rect', { name: 'A', x: 100, y: 100, w: 50, h: 50 });
  const engine = makeEngine(sceneWith([a]));
  assert.ok(engine.find('A'));
  engine.destroy(engine.find('A'));
  engine.cleanup();
  assert.equal(engine.find('A'), null);
  assert.equal(engine.instances.length, 0);
});

test('scripts run and errors are isolated', () => {
  const good = createNode('rect', {
    name: 'Scripter',
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    script: 'let n = 0;\nfunction onUpdate(node, api, dt) {\n  n += 1;\n  node.def.color = n > 2 ? "#00ff00" : "#ff0000";\n}',
  });
  const bad = createNode('rect', {
    name: 'Broken',
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    script: 'function onUpdate() { throw new Error("boom"); }',
  });
  const engine = makeEngine(sceneWith([good, bad]));
  engine.instances.forEach((i) => engine.compileScript(i));
  for (let i = 0; i < 3; i += 1) engine.runScripts(1 / 60);
  assert.equal(engine.find('Scripter').def.color, '#00ff00');
  assert.ok(engine.reportedErrors.size >= 1, 'script error should be reported, not crash the loop');
});

// ------------------------------------------------------------ demo integrity
test('demo project references only existing nodes and variables', () => {
  const project = defaultProject();
  assert.ok(project.scenes.length >= 2);
  for (const scene of project.scenes) {
    const names = new Set();
    const walk = (nodes) => nodes.forEach((n) => { names.add(n.name); walk(n.children || []); });
    walk(scene.nodes);

    const vars = Object.keys(scene.vars || {});
    for (const event of scene.events) {
      const p = event.triggerParams || {};
      for (const key of ['node', 'a', 'b']) {
        if (p[key]) assert.ok(names.has(p[key]), `trigger ${event.trigger} in "${scene.name}" references missing node ${p[key]}`);
      }
      for (const action of event.actions) {
        if (action.params?.node) {
          assert.ok(names.has(action.params.node), `action ${action.type} references missing node ${action.params.node}`);
        }
        if (action.params?.name && action.type !== 'spawn') {
          assert.ok(vars.includes(action.params.name), `action ${action.type} references missing variable ${action.params.name}`);
        }
      }
      for (const condition of event.conditions) {
        if (condition.params?.name) assert.ok(vars.includes(condition.params.name), `condition references missing variable ${condition.params.name}`);
        if (condition.params?.node) assert.ok(names.has(condition.params.node), `condition references missing node ${condition.params.node}`);
      }
    }

    for (const event of scene.events) {
      engineActionTypes(event).forEach((type) => {
        assert.ok(!type, 'noop');
      });
    }
  }

  function engineActionTypes() {
    return [];
  }

  // camera follow target must exist as well
  for (const scene of project.scenes) {
    const flat = flatten(scene);
    for (const inst of flat) {
      if (inst.def.type === 'camera' && inst.def.follow) {
        assert.ok(
          flat.some((i) => i.def.name === inst.def.follow),
          `camera follows missing node ${inst.def.follow}`,
        );
      }
    }
  }
});

test('demo project runs a few frames without throwing', () => {
  const project = defaultProject();
  const engine = new Engine({ project, scene: project.scenes[0], canvas: stubCanvas() });
  engine.build();
  engine.instances.forEach((i) => engine.compileScript(i));
  engine.frame = 0;
  for (let i = 0; i < 30; i += 1) {
    engine.update(1 / 60);
    engine.frame += 1;
  }
  assert.equal(engine.reportedErrors.size, 0, 'demo scene must not raise runtime errors');
  assert.ok(engine.find('Player'), 'player should still exist');
});
