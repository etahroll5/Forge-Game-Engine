// Asset library: import images (stored as data URLs inside the project) and
// manage them for sprite nodes.

import { el, clear } from '../util.js';
import { logInfo, logError } from '../console.js';

const MAX_BYTES = 2.5 * 1024 * 1024;

export function initAssetsPanel(rootEl, store) {
  const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: 'true', style: { display: 'none' } });

  function readFile(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error(`${file.name} is not an image`));
        return;
      }
      if (file.size > MAX_BYTES) {
        reject(new Error(`${file.name} is larger than 2.5 MB — resize it first`));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const img = new Image();
        img.onload = () => resolve({ dataUrl, w: img.naturalWidth, h: img.naturalHeight, name: file.name });
        img.onerror = () => reject(new Error(`${file.name} could not be decoded`));
        img.src = dataUrl;
      };
      reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function handleFiles(files) {
    for (const file of files) {
      try {
        const asset = await readFile(file);
        store.addAsset(asset.name.replace(/\.[^.]+$/, ''), asset.dataUrl, { w: asset.w, h: asset.h });
        logInfo(`Imported asset “${asset.name}” (${asset.w}×${asset.h})`);
      } catch (err) {
        logError(err.message);
      }
    }
  }

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length) handleFiles([...fileInput.files]);
    fileInput.value = '';
  });

  rootEl.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  rootEl.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) handleFiles([...e.dataTransfer.files]);
  });

  function render() {
    clear(rootEl);
    const assets = Object.values(store.project.assets || {});

    rootEl.appendChild(
      el('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center', gridColumn: '1 / -1' } }, [
        el('span', {
          style: { color: '#5f7291', fontSize: '11px' },
          text: `${assets.length} asset(s) — drop images here or click +`,
        }),
        el('button', {
          class: 'btn tiny primary',
          text: '+ Import',
          style: { marginLeft: 'auto' },
          on: { click: () => fileInput.click() },
        }),
      ]),
    );

    const grid = el('div', { class: 'assets', style: { gridColumn: '1 / -1' } });
    for (const asset of assets) {
      grid.appendChild(
        el('div', { class: 'asset-card', title: asset.name }, [
          el('img', { src: asset.dataUrl, alt: asset.name }),
          el('div', { class: 'asset-name', text: asset.name }),
          el('button', {
            class: 'row-x',
            text: '×',
            title: 'Delete asset',
            on: { click: () => store.removeAsset(asset.id) },
          }),
        ]),
      );
    }
    grid.appendChild(
      el('div', {
        class: 'asset-add',
        text: '+',
        title: 'Import an image',
        on: { click: () => fileInput.click() },
      }),
    );
    rootEl.appendChild(grid);
    rootEl.appendChild(fileInput);
  }

  store.subscribe((reason) => {
    if (reason === 'transform') return;
    render();
  });
  render();
  return { render };
}
