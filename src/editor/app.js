// Editor bootstrap: wires every panel to the store, owns play mode and the
// keyboard shortcuts.

import { el, clear, download } from '../util.js';
import { store } from '../store.js';
import { NODE_TYPES, NODE_TYPE_ORDER } from '../schema.js';
import { Engine } from '../runtime.js';
import { logInfo, logWarn, logError } from '../console.js';
import { initTree } from './tree.js';
import { initInspector } from './inspector.js';
import { initViewport } from './viewport.js';
import { initEventSheet } from './eventsheet.js';
import { initVarsPanel } from './vars.js';
import { initAssetsPanel } from './assets.js';
import { initConsolePanel } from './consolepanel.js';

const $ = (id) => document.getElementById(id);

function main() {
  const stage = $('stage');

  // ------------------------------------------------------------ boot state
  let restored = false;
  try {
    restored = store.hasSaved() && store.load();
  } catch (err) {
    logWarn(`Could not restore the saved project: ${err.message}`);
  }
  logInfo(restored ? 'Restored your saved project from this browser.' : 'Loaded the demo project — press Play to try it.');

  // -------------------------------------------------------------- viewport
  const zoomLabel = $('zoom-label');
  const viewport = initViewport(stage, store, {
    hud: $('stage-hud'),
    onZoom: (zoom) => {
      zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    },
  });
  zoomLabel.textContent = `${Math.round(viewport.zoom * 100)}%`;

  initTree($('tree'), store);
  initInspector($('inspector'), store);
  initEventSheet($('events'), store);
  initVarsPanel($('vars'), store);
  initAssetsPanel($('assets'), store);
  const consolePanel = initConsolePanel($('console'), $('console-badge'));

  // ---------------------------------------------------------- scene list UI
  const sceneListEl = $('scene-list');

  function renameScene(scene, nameEl) {
    const input = el('input', { type: 'text', value: scene.name, style: { flex: '1', minWidth: '0' } });
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    const finish = (commit) => {
      const value = input.value.trim();
      if (commit && value) store.renameScene(scene.id, value);
      else renderSceneList();
    };
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
  }

  function renderSceneList() {
    clear(sceneListEl);
    for (const scene of store.project.scenes) {
      const active = scene.id === store.sceneId;
      const nameEl = el('span', { class: 'node-name', text: scene.name });
      const item = el('div', {
        class: `scene-item${active ? ' active' : ''}`,
        title: `${scene.width}×${scene.height} · ${scene.nodes.length} nodes`,
      }, [
        el('span', { text: '▤', style: { opacity: '0.6', fontSize: '10px' } }),
        nameEl,
        el('span', { class: 'dots' }, [
          el('button', {
            class: 'row-x',
            text: '✕',
            title: 'Delete scene',
            on: {
              click: (e) => {
                e.stopPropagation();
                if (confirm(`Delete scene “${scene.name}”?`)) store.removeScene(scene.id);
              },
            },
          }),
        ]),
      ]);
      item.addEventListener('click', () => store.setScene(scene.id));
      item.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        renameScene(scene, nameEl);
      });
      sceneListEl.appendChild(item);
    }
  }

  $('btn-scene-add').addEventListener('click', () => {
    store.addScene();
    viewport.fit();
  });

  // -------------------------------------------------------------- add node
  function openModal({ title, subtitle, body }) {
    const root = $('modal-root');
    const close = () => {
      clear(root);
      document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    const backdrop = el('div', {
      class: 'modal-backdrop',
      on: {
        pointerdown: (e) => {
          if (e.target === backdrop) close();
        },
      },
    }, [
      el('div', { class: 'modal' }, [
        el('h3', { text: title }),
        subtitle ? el('p', { class: 'sub', text: subtitle }) : null,
        body,
        el('div', { class: 'modal-foot' }, [el('button', { class: 'btn', text: 'Close', on: { click: close } })]),
      ]),
    ]);
    document.addEventListener('keydown', onKey, true);
    clear(root);
    root.appendChild(backdrop);
    return close;
  }

  function openNodePicker() {
    const parent = store.selected();
    const nestInGroup = parent && parent.type === 'group' ? parent.id : null;
    const grid = el('div', { class: 'modal-grid' });
    const close = () => {};
    let closeFn = close;
    for (const type of NODE_TYPE_ORDER) {
      const def = NODE_TYPES[type];
      grid.appendChild(
        el('button', {
          class: 'pick-card',
          on: {
            click: () => {
              store.addNode(type, nestInGroup);
              closeFn();
              viewport.render();
            },
          },
        }, [
          el('span', { class: 'ico', text: def.icon }),
          el('span', { text: def.label }),
          el('small', { text: def.description || '' }),
        ]),
      );
    }
    closeFn = openModal({
      title: 'Add node',
      subtitle: nestInGroup ? `Will be added inside “${store.selected().name}”` : 'Will be added at the top level of the scene',
      body: grid,
    });
  }

  $('btn-node-add').addEventListener('click', openNodePicker);

  // --------------------------------------------------------------- toolbar
  $('btn-node-delete').addEventListener('click', () => {
    if (store.selectedId) store.removeNode();
    else logWarn('Select a node first');
  });

  $('btn-undo').addEventListener('click', () => store.undo());
  $('btn-redo').addEventListener('click', () => store.redo());

  $('btn-save').addEventListener('click', () => {
    if (store.save(false)) logInfo('Project saved to this browser');
    else logError('Browser storage is unavailable — use Export instead');
  });

  $('btn-export').addEventListener('click', () => {
    const name = store.project.name.replace(/[^\w.-]+/g, '-').toLowerCase() || 'game';
    download(`${name}.forge.json`, store.exportJSON());
    logInfo('Project exported as JSON');
  });

  const importInput = $('file-import');
  $('btn-import').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        store.importJSON(String(reader.result || ''));
        viewport.fit();
      } catch (err) {
        logError(`Import failed: ${err.message}`);
      }
    };
    reader.onerror = () => logError('Could not read that file');
    reader.readAsText(file);
    importInput.value = '';
  });

  $('btn-new').addEventListener('click', () => {
    if (!confirm('Start a new empty project? Your current project will be replaced (save first if unsure).')) return;
    store.reset(false);
    viewport.fit();
    logInfo('New empty project created');
  });

  const gridCheck = $('chk-grid');
  const snapCheck = $('chk-snap');
  gridCheck.checked = store.project.settings.showGrid !== false;
  snapCheck.checked = Boolean(store.project.settings.snap);
  gridCheck.addEventListener('change', () => {
    store.setProjectSetting('showGrid', gridCheck.checked);
  });
  snapCheck.addEventListener('change', () => {
    store.setProjectSetting('snap', snapCheck.checked);
  });
  $('btn-reset-view').addEventListener('click', () => viewport.fit());

  // ------------------------------------------------------------- dock tabs
  const tabs = [...document.querySelectorAll('.tab')];
  const panels = [...document.querySelectorAll('.dock-panel')];
  function activateDock(name) {
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.dock === name));
    panels.forEach((p) => p.classList.toggle('active', p.dataset.dockPanel === name));
    consolePanel.setVisible(name === 'console');
  }
  tabs.forEach((tab) => tab.addEventListener('click', () => activateDock(tab.dataset.dock)));
  activateDock('events');

  // -------------------------------------------------------------- play mode
  let engine = null;
  let playing = false;
  let hudTimer = null;

  function startScene(sceneData) {
    engine = new Engine({
      project: store.project,
      scene: sceneData,
      canvas: stage,
      onEnd: stopPlay,
      onSceneSwitch: switchRuntimeScene,
    });
    engine.start();
  }

  function switchRuntimeScene(name) {
    const target = store.project.scenes.find((s) => s.name === name) || store.project.scenes.find((s) => s.id === name);
    if (!target) {
      logError(`No scene named “${name}”`);
      return;
    }
    if (engine) engine.stop();
    startScene(JSON.parse(JSON.stringify(target)));
    logInfo(`Switched to scene “${target.name}”`);
  }

  function updatePlayUI() {
    $('btn-play').disabled = playing;
    $('btn-stop').disabled = !playing;
    $('play-badge').hidden = !playing;
    $('stage-help').hidden = playing;
    stage.style.cursor = playing ? 'default' : 'crosshair';
    if (playing) {
      if (hudTimer) clearInterval(hudTimer);
      hudTimer = setInterval(() => {
        const hud = $('stage-hud');
        clear(hud);
        if (!engine) return;
        const chips = [
          ['FPS', String(engine.frameStats.fps)],
          ['Scene', engine.scene.name],
          ['Nodes', String(engine.instances.length)],
        ];
        const vars = Object.entries(engine.vars || {});
        if (vars.length) chips.push(['Vars', vars.map(([k, v]) => `${k}=${v}`).join(' ')]);
        for (const [k, v] of chips) {
          hud.appendChild(el('span', { class: 'hud-chip' }, [`${k}: `, el('strong', { text: v })]));
        }
      }, 300);
    } else {
      if (hudTimer) clearInterval(hudTimer);
      hudTimer = null;
    }
  }

  function play() {
    if (playing) return;
    playing = true;
    viewport.setActive(false);
    startScene(store.sceneForRuntime());
    updatePlayUI();
  }

  function stopPlay() {
    if (engine) {
      engine.stop();
      engine = null;
    }
    const wasPlaying = playing;
    playing = false;
    updatePlayUI();
    viewport.setActive(true);
    if (wasPlaying) logInfo('■ Stopped');
  }

  $('btn-play').addEventListener('click', play);
  $('btn-stop').addEventListener('click', stopPlay);

  // ------------------------------------------------------------- shortcuts
  const isTyping = () => {
    const el2 = document.activeElement;
    return el2 && (el2.tagName === 'INPUT' || el2.tagName === 'TEXTAREA' || el2.tagName === 'SELECT' || el2.isContentEditable);
  };

  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (mod && key === 'y') {
      e.preventDefault();
      store.redo();
      return;
    }
    if (mod && key === 's') {
      e.preventDefault();
      if (store.save(false)) logInfo('Project saved to this browser');
      else logError('Browser storage is unavailable — use Export');
      return;
    }
    if (e.key === 'F5') {
      e.preventDefault();
      if (playing) stopPlay();
      else play();
      return;
    }
    if (e.key === 'Escape' && playing) {
      stopPlay();
      return;
    }
    if (isTyping()) return;

    if (mod && key === 'd') {
      e.preventDefault();
      store.duplicateNode();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (store.selectedId) {
        e.preventDefault();
        store.removeNode();
      }
      return;
    }
    if (e.key.startsWith('Arrow') && store.selectedId && !playing) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') viewport.nudge(-step, 0);
      if (e.key === 'ArrowRight') viewport.nudge(step, 0);
      if (e.key === 'ArrowUp') viewport.nudge(0, -step);
      if (e.key === 'ArrowDown') viewport.nudge(0, step);
    }
  });

  window.addEventListener('resize', () => {
    if (!playing) {
      viewport.render();
      return;
    }
    const rect = stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    stage.width = Math.max(1, Math.round(rect.width * dpr));
    stage.height = Math.max(1, Math.round(rect.height * dpr));
  });

  // --------------------------------------------------------------- redraws
  store.subscribe((reason) => {
    $('btn-undo').disabled = !store.canUndo();
    $('btn-redo').disabled = !store.canRedo();
    if (reason === 'transform') return;
    renderSceneList();
    if (gridCheck.checked !== (store.project.settings.showGrid !== false)) gridCheck.checked = store.project.settings.showGrid !== false;
    if (snapCheck.checked !== Boolean(store.project.settings.snap)) snapCheck.checked = Boolean(store.project.settings.snap);
  });

  renderSceneList();
  $('btn-undo').disabled = !store.canUndo();
  $('btn-redo').disabled = !store.canRedo();

  // expose for debugging in the browser console
  window.appjet = { store, viewport, get engine() { return engine; } };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
