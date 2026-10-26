// Inspector: schema-driven property editor for the selected node, its
// behaviors and its script. Falls back to stage settings when nothing is
// selected.

import { el, clear, num } from '../util.js';
import { NODE_TYPES, BEHAVIORS, BEHAVIOR_ORDER } from '../schema.js';
import { createField } from './fields.js';

const TRANSFORM_KEYS = new Set(['x', 'y', 'rotation', 'scaleX', 'scaleY']);
const CONTENT_KEYS = new Set(['w', 'h', 'color', 'opacity', 'asset', 'text', 'fontSize']);
const FLAG_KEYS = new Set(['solid', 'visible']);

export function initInspector(rootEl, store) {
  let renderedFor = null;
  const refs = new Map();

  function section(title, children, extra) {
    return el('div', { class: 'insp-section' }, [
      el('h4', {}, [el('span', { text: title }), extra || null]),
      ...children,
    ]);
  }

  function nodeField(node, field) {
    const control = createField(
      field,
      node[field.key],
      (value, live) => {
        if (live) {
          node[field.key] = value;
          store.type('prop');
        } else {
          store.setNode(node.id, field.key, value);
        }
      },
      { scene: store.scene(), assets: store.project.assets, scenes: store.project.scenes },
    );
    const input = control.querySelector('input, select, textarea');
    if (input && (field.type === 'number' || field.type === 'text')) refs.set(field.key, input);
    return control;
  }

  function build() {
    clear(rootEl);
    refs.clear();
    const node = store.selected();
    renderedFor = store.selectedId;

    if (!node) {
      buildScenePanel();
      return;
    }

    const schema = NODE_TYPES[node.type] || NODE_TYPES.rect;
    const fields = schema.fields || [];
    const groups = [
      ['Transform', (f) => TRANSFORM_KEYS.has(f.key)],
      ['Appearance', (f) => CONTENT_KEYS.has(f.key)],
      ['Physics & flags', (f) => FLAG_KEYS.has(f.key)],
      ['Settings', (f) => !TRANSFORM_KEYS.has(f.key) && !CONTENT_KEYS.has(f.key) && !FLAG_KEYS.has(f.key)],
    ];

    // header
    const nameInput = el('input', { type: 'text', value: node.name });
    nameInput.addEventListener('change', () => {
      const value = nameInput.value.trim();
      if (value) store.setNode(node.id, 'name', value);
    });
    rootEl.appendChild(
      el('div', { class: 'insp-head' }, [
        el('div', { class: 'type', text: `${schema.icon || '▭'} ${schema.label} · ${node.type}` }),
        nameInput,
      ]),
    );

    for (const [title, filter] of groups) {
      const list = fields.filter(filter);
      if (!list.length) continue;
      rootEl.appendChild(section(title, list.map((f) => nodeField(node, f))));
    }

    // meta / tags
    rootEl.appendChild(
      section('Tags', [
        createField(
          { key: 'tags', label: 'Tags', type: 'tags' },
          node.tags,
          (value) => store.setNode(node.id, 'tags', value),
          { scene: store.scene() },
        ),
        el('div', { class: 'script-hint' }, ['Behaviors and events can target tags, e.g. ', el('code', { text: 'player' }), '.']),
      ]),
    );

    // behaviors
    const behaviors = Array.isArray(node.behaviors) ? node.behaviors : [];
    const behaviorChildren = behaviors.map((behavior, index) => {
      const def = BEHAVIORS[behavior.type];
      if (!def) return el('div', { class: 'behavior-item', text: `Unknown behavior: ${behavior.type}` });
      return el('div', { class: 'behavior-item' }, [
        el('div', { class: 'behavior-head' }, [
          el('span', { text: def.label }),
          el('button', {
            class: 'row-x',
            text: '×',
            title: 'Remove behavior',
            on: {
              click: () => {
                store.commit('remove behavior', () => behaviors.splice(index, 1));
              },
            },
          }),
        ]),
        el(
          'div',
          { class: 'behavior-body' },
          def.fields.map((field) =>
            createField(
              field,
              behavior[field.key],
              (value) => {
                store.commit('behavior prop', () => {
                  behavior[field.key] = value;
                });
              },
              { scene: store.scene(), assets: store.project.assets, scenes: store.project.scenes },
            ),
          ),
        ),
      ]);
    });

    const addSelect = el('select');
    for (const type of BEHAVIOR_ORDER) addSelect.appendChild(el('option', { value: type, text: BEHAVIORS[type].label }));
    const addBtn = el('button', { class: 'btn tiny', text: 'Attach' });
    addBtn.addEventListener('click', () => {
      store.commit('add behavior', () => {
        const def = BEHAVIORS[addSelect.value];
        if (!def) return;
        if (!Array.isArray(node.behaviors)) node.behaviors = [];
        node.behaviors.push({ type: addSelect.value, ...JSON.parse(JSON.stringify(def.defaults || {})) });
      });
    });

    rootEl.appendChild(
      section('Behaviors', [
        ...behaviorChildren,
        el('div', { class: 'insp-add' }, [addSelect, addBtn]),
      ]),
    );

    // script
    const scriptArea = el('textarea', { rows: 6, spellcheck: 'false' });
    scriptArea.value = node.script || '';
    scriptArea.placeholder = 'function onStart(node, api) {\n  // once, when play begins\n}\n\nfunction onUpdate(node, api, dt) {\n  // every frame\n}';
    scriptArea.addEventListener('change', () => store.setNode(node.id, 'script', scriptArea.value));

    rootEl.appendChild(
      section('Script', [
        scriptArea,
        el('div', { class: 'script-hint' }, [
          'Runs in play mode. Use ',
          el('code', { text: 'node.wx / node.wy' }),
          ', ',
          el('code', { text: 'api.find(name)' }),
          ', ',
          el('code', { text: 'api.spawn(type,x,y)' }),
          ', ',
          el('code', { text: 'api.vars' }),
          ', ',
          el('code', { text: 'api.log(msg)' }),
          '.',
        ]),
      ]),
    );
  }

  function buildScenePanel() {
    const scene = store.scene();
    rootEl.appendChild(
      el('div', { class: 'insp-head' }, [el('div', { class: 'type', text: '▶ Stage / Scene' }), el('div', { text: scene.name })]),
    );
    rootEl.appendChild(
      section('Stage', [
        createField({ key: 'name', label: 'Scene name', type: 'text' }, scene.name, (v) => store.renameScene(scene.id, v)),
        createField({ key: 'width', label: 'Width', type: 'number', step: 10, min: 50 }, scene.width, (v) =>
          store.setSceneSetting('width', Math.max(50, num(v, 960))),
        ),
        createField({ key: 'height', label: 'Height', type: 'number', step: 10, min: 50 }, scene.height, (v) =>
          store.setSceneSetting('height', Math.max(50, num(v, 540))),
        ),
        createField({ key: 'bg', label: 'Background', type: 'color' }, scene.bg, (v) => store.setSceneSetting('bg', v)),
      ]),
    );
    rootEl.appendChild(
      section('Editor', [
        createField({ key: 'grid', label: 'Grid size', type: 'number', step: 2, min: 4 }, store.project.settings.grid, (v) =>
          store.setProjectSetting('grid', Math.max(4, num(v, 20))),
        ),
        el('div', { class: 'script-hint', text: 'Select a node in the hierarchy or the viewport to edit its properties.' }),
      ]),
    );
  }

  function syncValues() {
    const node = store.selected();
    if (!node) return;
    for (const [key, input] of refs) {
      if (document.activeElement === input) continue;
      const value = node[key];
      if (input.type === 'number') {
        if (String(num(input.value, NaN)) !== String(num(value, 0))) input.value = String(value ?? 0);
      } else if (input.value !== String(value ?? '')) {
        input.value = String(value ?? '');
      }
    }
  }

  store.subscribe((reason) => {
    const stillSame = renderedFor === store.selectedId;
    if (reason === 'transform' && stillSame) {
      syncValues();
      return;
    }
    if (reason === 'select' && stillSame) return;
    build();
  });

  build();
  return { render: build };
}
