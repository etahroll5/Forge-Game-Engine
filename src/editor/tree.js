// Scene hierarchy tree with rename, reparenting via drag & drop and visibility
// toggles.

import { el, clear } from '../util.js';
import { findEntry, flatNodes } from '../project.js';
import { NODE_TYPES } from '../schema.js';

const collapsed = new Set();

export function initTree(rootEl, store) {
  let dragId = null;

  function render() {
    clear(rootEl);
    const scene = store.scene();
    if (!scene.nodes.length) {
      rootEl.appendChild(
        el('div', { class: 'tree-empty' }, [
          'No nodes yet.',
          el('br'),
          'Use “+ Add” to create your first node.',
        ]),
      );
      return;
    }

    const walk = (nodes, depth, parent) => {
      for (const node of nodes) {
        const hasKids = (node.children || []).length > 0;
        const isCollapsed = collapsed.has(node.id);
        const row = el(
          'div',
          {
            class: `tree-item${node.id === store.selectedId ? ' selected' : ''}`,
            draggable: 'true',
            style: { paddingLeft: `${8 + depth * 14}px` },
            dataset: { id: node.id },
          },
          [
            el('span', {
              class: `caret${hasKids ? '' : ' empty'}`,
              text: hasKids ? (isCollapsed ? '▶' : '▼') : '•',
              on: {
                click: (e) => {
                  e.stopPropagation();
                  if (!hasKids) return;
                  if (isCollapsed) collapsed.delete(node.id);
                  else collapsed.add(node.id);
                  render();
                },
              },
            }),
            el('span', { class: 'node-icon', text: NODE_TYPES[node.type]?.icon || '▭' }),
            el('span', { class: 'node-name', text: node.name }),
            node.tags
              ? el('span', { class: 'tag', text: String(node.tags).split(',')[0].trim() })
              : null,
            el('span', {
              class: 'vis',
              text: node.visible === false ? '◌' : '●',
              title: 'Toggle visibility',
              on: {
                click: (e) => {
                  e.stopPropagation();
                  store.setNode(node.id, 'visible', node.visible === false);
                },
              },
            }),
          ],
        );

        row.addEventListener('click', () => store.select(node.id));
        row.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          startRename(row, node);
        });

        row.addEventListener('dragstart', (e) => {
          dragId = node.id;
          e.dataTransfer.effectAllowed = 'move';
          try {
            e.dataTransfer.setData('text/plain', node.id);
          } catch { /* some browsers restrict this */ }
        });
        row.addEventListener('dragend', () => {
          dragId = null;
        });
        row.addEventListener('dragover', (e) => {
          if (!dragId || dragId === node.id) return;
          e.preventDefault();
          const rect = row.getBoundingClientRect();
          const ratio = (e.clientY - rect.top) / rect.height;
          row.classList.remove('drop-into', 'drop-before');
          if (ratio < 0.28) row.classList.add('drop-before');
          else row.classList.add('drop-into');
        });
        row.addEventListener('dragleave', () => row.classList.remove('drop-into', 'drop-before'));
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          const rect = row.getBoundingClientRect();
          const ratio = (e.clientY - rect.top) / rect.height;
          row.classList.remove('drop-into', 'drop-before');
          if (!dragId || dragId === node.id) return;
          if (ratio < 0.28) {
            const entry = findEntry(scene.nodes, node.id);
            if (!entry) return;
            const targetParent = parent ? parent.id : null;
            store.moveNode(dragId, targetParent, entry.index);
          } else {
            store.moveNode(dragId, node.id, null);
            collapsed.delete(node.id);
          }
          dragId = null;
        });

        rootEl.appendChild(row);
        if (hasKids && !isCollapsed) walk(node.children, depth + 1, node);
      }
    };

    walk(scene.nodes, 0, null);

    // Drop on empty space below the tree → move to scene root.
    rootEl.ondragover = (e) => {
      if (!dragId) return;
      e.preventDefault();
    };
    rootEl.ondrop = (e) => {
      if (!dragId) return;
      e.preventDefault();
      const onRow = e.target.closest('.tree-item');
      if (onRow) return;
      store.moveNode(dragId, null, null);
      dragId = null;
    };
  }

  function startRename(row, node) {
    const nameEl = row.querySelector('.node-name');
    if (!nameEl) return;
    const input = el('input', { type: 'text', value: node.name, style: { flex: '1', minWidth: '0' } });
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    const finish = (commit) => {
      const value = input.value.trim();
      if (commit && value && value !== node.name) store.setNode(node.id, 'name', value);
      else render();
    };
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });
  }

  store.subscribe((reason) => {
    if (reason === 'transform') return; // pure moves do not change the tree shape
    render();
  });
  render();
  return { render };
}

export function nodeCount(scene) {
  return flatNodes(scene).length;
}
