import { GENRE_DISPLAY_MAP } from './utils.js';

const DRAFTS_API = '/api/drafts';

let drafts = [];
let activeDraftId = null;
let uploaderRef = null;
let previewTitleFn = null;

function collectFormData() {
  const form = document.getElementById('beatForm');
  const fd = new FormData(form);
  const genres = [...document.querySelectorAll('#genreChips .chip.is-active')]
    .map((chip) => chip.dataset.genre || chip.textContent.trim().toLowerCase());

  return {
    beatName: String(fd.get('beatName') ?? '').trim(),
    bpm: String(fd.get('bpm') ?? '').trim(),
    key: String(fd.get('key') ?? ''),
    keyType: String(fd.get('scale') ?? 'Minor'),
    artistA: String(fd.get('artistA') ?? '').trim(),
    artistB: String(fd.get('artistB') ?? '').trim(),
    genres,
    license: String(fd.get('licenseType') ?? 'Free').toLowerCase(),
    price: String(fd.get('price') ?? '').trim(),
    beatstarsUrl: String(fd.get('beatstarsLink') ?? '').trim(),
    producerTag: String(fd.get('producerTag') ?? '').trim()
  };
}

function fillFormWithDraft(data) {
  const form = document.getElementById('beatForm');
  const set = (name, val) => {
    const el = form?.querySelector(`[name="${name}"]`);
    if (el) el.value = val ?? '';
  };

  set('beatName', data.beatName);
  set('bpm', data.bpm);
  set('key', data.key);
  set('scale', data.keyType ?? data.scale ?? 'Minor');
  set('price', data.price);
  set('beatstarsLink', data.beatstarsUrl ?? data.beatstarsLink);
  set('producerTag', data.producerTag);
  set('artistA', data.artistA);
  set('artistB', data.artistB);
  set('licenseType', data.license
    ? data.license.charAt(0).toUpperCase() + data.license.slice(1)
    : 'Free');

  const genreSlugs = (data.genres ?? []).map((g) => String(g).toLowerCase());
  document.querySelectorAll('#genreChips .chip').forEach((chip) => {
    const slug = chip.dataset.genre;
    chip.classList.toggle('is-active', genreSlugs.includes(slug));
  });

  if (uploaderRef?.setGenres) {
    uploaderRef.setGenres(data.genres ?? []);
  }

  if (previewTitleFn) previewTitleFn();

  const banner = document.getElementById('draft-loaded-banner');
  if (banner) banner.classList.remove('hidden');
}

function updateDraftCount() {
  const el = document.getElementById('drafts-count');
  if (el) el.textContent = `(${drafts.length})`;
}

async function loadDraftsList() {
  try {
    const res = await fetch(DRAFTS_API);
    const json = await res.json();
    drafts = json.drafts ?? [];
    renderDraftsList();
    updateDraftCount();
  } catch (err) {
    console.warn('[drafts] Could not load drafts:', err.message);
  }
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderDraftsList() {
  const container = document.getElementById('drafts-list');
  if (!container) return;

  if (drafts.length === 0) {
    container.innerHTML = `
      <div class="drafts-empty">
        <span class="drafts-empty-icon">📝</span>
        <p>No saved drafts yet.</p>
        <p class="drafts-empty-sub">Fill in beat details and click <strong>Save Draft</strong>.</p>
      </div>`;
    return;
  }

  container.innerHTML = drafts.map((d) => {
    const artists = d.preview.artistB
      ? `${d.preview.artistA} x ${d.preview.artistB}`
      : (d.preview.artistA ?? 'Unknown Artist');
    const genre = (d.preview.genres?.[0] ?? '').toLowerCase();
    const genreDisp = GENRE_DISPLAY_MAP[genre] ?? genre;
    const date = new Date(d.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const isActive = d.id === activeDraftId;

    return `
    <div class="draft-card ${isActive ? 'draft-card--active' : ''}" data-draft-id="${d.id}">
      <div class="draft-card__body">
        <p class="draft-card__artists">${escHtml(artists)}</p>
        <p class="draft-card__meta">${escHtml(genreDisp)} · ${d.preview.bpm ?? '--'} BPM</p>
        <p class="draft-card__name">${escHtml(d.name)}</p>
        <p class="draft-card__date">Saved ${date}</p>
      </div>
      <div class="draft-card__actions">
        <button class="ghost-button draft-load" data-id="${d.id}" type="button" title="Load draft">↑ Load</button>
        <button class="ghost-button draft-delete" data-id="${d.id}" type="button" title="Delete draft">🗑</button>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.draft-load').forEach((btn) => {
    btn.addEventListener('click', () => loadDraft(btn.dataset.id));
  });
  container.querySelectorAll('.draft-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteDraft(btn.dataset.id));
  });
}

function showToast(message, type = 'success') {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

async function saveDraft() {
  const data = collectFormData();
  const defaultName = [
    data.artistA,
    data.artistB ? `x ${data.artistB}` : '',
    data.genres?.[0] ? `(${GENRE_DISPLAY_MAP[data.genres[0]] ?? data.genres[0]})` : ''
  ].filter(Boolean).join(' ') || 'Untitled Beat';

  const btn = document.getElementById('save-draft-btn');
  if (btn) {
    btn.textContent = 'Saving…';
    btn.disabled = true;
  }

  try {
    if (activeDraftId) {
      await fetch(`${DRAFTS_API}/${activeDraftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
      });
      showToast('Draft updated ✓');
    } else {
      const res = await fetch(DRAFTS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: defaultName, data })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      activeDraftId = json.draft.id;
      showToast('Draft saved ✓');
    }
    await loadDraftsList();
  } catch (err) {
    showToast('Could not save draft', 'error');
    console.error('[drafts] Save error:', err);
  } finally {
    if (btn) {
      btn.textContent = '💾 Save Draft';
      btn.disabled = false;
    }
  }
}

async function loadDraft(id) {
  try {
    const res = await fetch(`${DRAFTS_API}/${id}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Load failed');
    fillFormWithDraft(json.draft.data);
    activeDraftId = id;
    renderDraftsList();
    showToast(`Loaded: ${json.draft.name}`);
    document.querySelector('[data-panel="1"]')?.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showToast('Could not load draft', 'error');
    console.error('[drafts] Load error:', err);
  }
}

async function deleteDraft(id) {
  const card = document.querySelector(`.draft-card[data-draft-id="${id}"]`);
  if (card && !card.dataset.confirmDelete) {
    card.dataset.confirmDelete = 'true';
    const btn = card.querySelector('.draft-delete');
    if (btn) {
      btn.textContent = 'Confirm?';
      btn.style.color = 'var(--error)';
    }
    setTimeout(() => {
      delete card.dataset.confirmDelete;
      if (btn) {
        btn.textContent = '🗑';
        btn.style.color = '';
      }
    }, 3000);
    return;
  }

  try {
    await fetch(`${DRAFTS_API}/${id}`, { method: 'DELETE' });
    if (activeDraftId === id) activeDraftId = null;
    drafts = drafts.filter((d) => d.id !== id);
    renderDraftsList();
    updateDraftCount();
    showToast('Draft deleted');
  } catch {
    showToast('Could not delete draft', 'error');
  }
}

export function initDrafts(uploader, previewTitle) {
  uploaderRef = uploader;
  previewTitleFn = previewTitle;

  loadDraftsList();

  document.getElementById('save-draft-btn')?.addEventListener('click', saveDraft);

  document.getElementById('drafts-toggle-btn')?.addEventListener('click', () => {
    const body = document.getElementById('drafts-body');
    const btn = document.getElementById('drafts-toggle-btn');
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    btn.innerHTML = isOpen ? `Show <span id="drafts-count">(${drafts.length})</span>` : 'Hide';
    btn.setAttribute('aria-expanded', String(!isOpen));
    updateDraftCount();
  });

  let autoSaveTimer;
  const debouncedAutoSave = () => {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      if (activeDraftId) saveDraft();
    }, 30_000);
  };

  document.getElementById('beatForm')?.addEventListener('input', debouncedAutoSave);
  document.addEventListener('beatflow:form-changed', debouncedAutoSave);

  window.BeatflowDrafts = { saveDraft, loadDraft, deleteDraft, loadDraftsList };
}
