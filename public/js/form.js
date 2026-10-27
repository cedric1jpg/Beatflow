import { generateClientMetadata } from './metadata-client.js';
import { buildPreviewTitle } from './utils.js';

function getEl(id) {
  return document.getElementById(id);
}

function clearErrors(form) {
  form.querySelectorAll('.field-error').forEach((node) => {
    node.textContent = '';
  });
}

function setError(label, message) {
  const error = label.querySelector('.field-error');
  if (error) {
    error.textContent = message;
  }
}

function triggerShake(input) {
  input.classList.add('shake');
  setTimeout(() => {
    input.classList.remove('shake');
  }, 350);
}

function getSelectedGenres() {
  return [...document.querySelectorAll('#genreChips .chip.is-active')]
    .map((chip) => chip.dataset.genre || chip.textContent.trim().toLowerCase());
}

export function previewTitle() {
  const form = getEl('beatForm');
  const artistA = form?.querySelector('input[name="artistA"]')?.value?.trim() || 'Artist A';
  const artistB = form?.querySelector('input[name="artistB"]')?.value?.trim() || '';
  const genres = getSelectedGenres();
  const title = buildPreviewTitle({ artistA, artistB, genres });

  const el = getEl('title-preview');
  if (el) {
    el.textContent = title;
    el.classList.toggle('title-over-limit', title.length > 100);
  }

  const count = getEl('title-char-count');
  if (count) {
    count.textContent = `${title.length} / 100`;
  }

  const titleInput = getEl('titleInput');
  if (titleInput && document.activeElement !== titleInput) {
    titleInput.value = title;
  }

  return title;
}

export function createFormController(appState, uploader) {
  const form = getEl('beatForm');
  const titleInput = getEl('titleInput');
  const descriptionInput = getEl('descriptionInput');
  const tagList = getEl('tagList');
  const previewImage = getEl('previewImage');
  const beatNameInput = form.querySelector('input[name="beatName"]');

  if (beatNameInput) {
    const beatNameLabel = beatNameInput.closest('label');
    const counter = document.createElement('span');
    counter.className = 'char-counter';
    counter.textContent = '0/60';
    beatNameLabel.appendChild(counter);

    beatNameInput.addEventListener('input', (e) => {
      const len = e.target.value.length;
      counter.textContent = `${len}/60`;
      if (len >= 58) {
        counter.classList.add('error');
        counter.classList.remove('warn');
      } else if (len >= 50) {
        counter.classList.add('warn');
        counter.classList.remove('error');
      } else {
        counter.classList.remove('warn', 'error');
      }
    });
  }

  form.querySelector('input[name="artistA"]')?.addEventListener('input', previewTitle);
  form.querySelector('input[name="artistB"]')?.addEventListener('input', previewTitle);
  document.addEventListener('beatflow:form-changed', previewTitle);
  previewTitle();

  function renderHashtagPreview(hashtags) {
    const row = document.getElementById('hashtag-preview-row');
    if (!row) return;

    if (!hashtags || hashtags.length === 0) {
      row.innerHTML = '<span class="hashtag-none">No hashtags generated</span>';
      return;
    }

    const escHtml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    row.innerHTML = hashtags.map((tag, i) => `
      <span class="hashtag-chip ${i < 3 ? 'hashtag-chip--above-title' : ''}">
        ${escHtml(tag)}
        ${i < 3 ? '<span class="hashtag-chip__label">above title</span>' : ''}
      </span>
    `).join('');
  }

  function fillMetadata(metadata) {
    titleInput.value = metadata.title;
    descriptionInput.value = metadata.description;
    tagList.innerHTML = metadata.tags
      .map((tag) => `<button type="button" class="chip is-removable" data-tag="${tag}">${tag} ×</button>`)
      .join('');
    renderHashtagPreview(metadata.hashtags);
    previewTitle();
  }

  async function generatePreview() {
    clearErrors(form);
    const formData = new FormData(form);
    const beatData = {
      beatName: formData.get('beatName'),
      bpm: formData.get('bpm'),
      key: formData.get('key'),
      scale: formData.get('scale'),
      artistA: formData.get('artistA'),
      artistB: formData.get('artistB'),
      genreTags: [...uploader.state.genres],
      licenseType: formData.get('licenseType'),
      beatstarsLink: formData.get('beatstarsLink'),
      producerTag: formData.get('producerTag')
    };

    let valid = true;
    form.querySelectorAll('label').forEach((label) => {
      const input = label.querySelector('input, select, textarea');
      if (!input) return;
      if (input.hasAttribute('required') && !String(input.value || '').trim()) {
        setError(label, 'This field is required.');
        triggerShake(input);
        valid = false;
      }
      if (input.name === 'bpm') {
        const bpm = Number(input.value);
        if (!Number.isFinite(bpm) || bpm < 1 || bpm > 300) {
          setError(label, 'BPM must be between 1 and 300.');
          triggerShake(input);
          valid = false;
        }
      }
      if (input.name === 'beatstarsLink' && input.value && !/^https?:\/\//i.test(input.value)) {
        setError(label, 'Use a valid URL.');
        triggerShake(input);
        valid = false;
      }
    });

    if (!uploader.state.audio) {
      const filesEl = getEl('selectedFiles');
      if (filesEl) {
        filesEl.textContent = 'Select a beat file first.';
        filesEl.classList.add('is-error');
      }
      return null;
    }

    if (!valid) {
      return null;
    }

    let profile = {};
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const json = await res.json();
        profile = json.profile || {};
      }
    } catch (err) {
      console.warn('Could not load profile for preview', err);
    }

    const metadata = generateClientMetadata(beatData, profile);
    appState.beatData = beatData;
    appState.metadata = metadata;
    fillMetadata(metadata);
    previewImage.src = uploader.state.thumbnail ? URL.createObjectURL(uploader.state.thumbnail) : previewImage.src;
    return metadata;
  }

  tagList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tag]');
    if (!button) return;
    button.remove();
    appState.metadata.tags = appState.metadata.tags.filter((tag) => tag !== button.dataset.tag);
  });

  getEl('regenerateMetadata').addEventListener('click', async () => {
    await generatePreview();
  });

  return {
    generatePreview,
    previewTitle,
    getDraft: () => ({
      title: titleInput.value,
      description: descriptionInput.value,
      tags: appState.metadata?.tags || []
    })
  };
}
