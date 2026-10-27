const GENRES = ['Trap', 'Drill', 'Afrobeats', 'R&B', 'Melodic', 'Dark', 'Chill', 'Aggressive', 'Emotional', 'Hard', 'Dancehall'];
import { getOverlayTheme, isOverlayEnabled } from './overlayPreview.js';

function getEl(id) {
  return document.getElementById(id);
}

const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/aiff'];
const ALLOWED_AUDIO_EXTS = ['.mp3', '.wav', '.flac', '.aiff'];
const MAX_FILE_BYTES = 200 * 1024 * 1024;

function showUploadError(message) {
  const selectedFiles = getEl('selectedFiles');
  if (selectedFiles) {
    selectedFiles.textContent = message;
    selectedFiles.classList.add('is-error');
    setTimeout(() => selectedFiles.classList.remove('is-error'), 4000);
  } else {
    alert(message);
  }
}

function validateAudioFile(file) {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  if (!ALLOWED_AUDIO_TYPES.includes(file.type) && !ALLOWED_AUDIO_EXTS.includes(ext)) {
    showUploadError(`"${file.name}" is not a supported audio file. Please upload an MP3 or WAV.`);
    return false;
  }
  if (file.size > MAX_FILE_BYTES) {
    showUploadError(`File is too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Maximum is 200 MB.`);
    return false;
  }
  return true;
}

function isAudioFile(file) {
  const name = file?.name?.toLowerCase() || '';
  const ext = name.slice(name.lastIndexOf('.'));
  return Boolean(file) && (file.type.startsWith('audio/') || ALLOWED_AUDIO_EXTS.includes(ext));
}

function isImageFile(file) {
  const name = file?.name?.toLowerCase() || '';
  return Boolean(file) && (file.type.startsWith('image/') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png'));
}

export function createUploader(appState) {
  const audioInput = getEl('audioInput');
  const thumbnailInput = getEl('thumbnailInput');
  const dropzone = getEl('dropzone');
  const selectedFiles = getEl('selectedFiles');
  const genreContainer = getEl('genreChips');

  const state = {
    audio: null,
    thumbnail: null,
    genres: new Set()
  };

  function renderWaveform() {
    let waveContainer = dropzone.querySelector('.waveform-bars');
    if (waveContainer) waveContainer.remove();
    
    waveContainer = document.createElement('div');
    waveContainer.className = 'waveform-bars';
    
    for (let i = 0; i < 32; i++) {
      const bar = document.createElement('span');
      const height = 8 + Math.random() * 40;
      const delay = i * 0.04;
      bar.style.height = height + 'px';
      bar.style.animationDelay = delay + 's';
      waveContainer.appendChild(bar);
    }
    
    const filesLabel = dropzone.querySelector('#selectedFiles');
    if (filesLabel) {
      dropzone.insertBefore(waveContainer, filesLabel);
    } else {
      dropzone.appendChild(waveContainer);
    }
  }

  function sync() {
    appState.uploaded = {
      audio: state.audio,
      thumbnail: state.thumbnail,
      genres: [...state.genres]
    };
    const audioLabel = state.audio ? state.audio.name : 'No audio selected';
    const thumbnailLabel = state.thumbnail ? state.thumbnail.name : 'No thumbnail selected';
    const genreLabel = [...state.genres].join(', ') || 'none';
    selectedFiles.textContent = `${audioLabel} | ${thumbnailLabel} | Genres: ${genreLabel}`;
    if (state.audio) {
      renderWaveform();
    }
  }

  GENRES.forEach((genre) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = genre;
    chip.dataset.genre = genre.toLowerCase();
    chip.addEventListener('click', () => {
      if (state.genres.has(genre)) {
        state.genres.delete(genre);
      } else {
        state.genres.add(genre);
      }
      chip.classList.toggle('is-active', state.genres.has(genre));
      sync();
      document.dispatchEvent(new CustomEvent('beatflow:form-changed'));
    });
    genreContainer.appendChild(chip);
  });

  function setAudio(file) {
    if (!validateAudioFile(file)) {
      return;
    }
    if (!isAudioFile(file)) {
      showUploadError('Please choose an MP3 or WAV file.');
      return;
    }
    state.audio = file;
    sync();
  }

  function setThumbnail(file) {
    if (file && !isImageFile(file)) {
      throw new Error('Thumbnail must be JPG or PNG.');
    }
    state.thumbnail = file || null;
    sync();
  }

  audioInput.addEventListener('change', () => {
    const file = audioInput.files?.[0];
    if (file) setAudio(file);
  });

  thumbnailInput.addEventListener('change', () => {
    try {
      setThumbnail(thumbnailInput.files?.[0]);
    } catch (error) {
      alert(error.message);
    }
  });

  getEl('browseAudio').addEventListener('click', () => audioInput.click());
  getEl('browseThumbnail').addEventListener('click', () => thumbnailInput.click());

  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragover');
    const [file] = event.dataTransfer.files;
    if (!file) return;
    if (file.type.startsWith('audio/')) {
      setAudio(file);
    } else {
      setThumbnail(file);
    }
  });

  sync();

  return {
    state,
    setGenres(genres = []) {
      const mapped = genres.map((g) => {
        const slug = String(g).toLowerCase();
        return GENRES.find((x) => x.toLowerCase() === slug) || g;
      });
      state.genres = new Set(mapped);
      genreContainer.querySelectorAll('.chip').forEach((chip) => {
        chip.classList.toggle('is-active', state.genres.has(chip.textContent.trim()));
      });
      sync();
      document.dispatchEvent(new CustomEvent('beatflow:form-changed'));
    },
    getPayload(formData) {
      if (!state.audio) {
        throw new Error('Select a beat file first.');
      }
      const payload = new FormData();
      payload.append('audio', state.audio);
      if (state.thumbnail) {
        payload.append('thumbnail', state.thumbnail);
      }
      // Attach clips if any were uploaded
      const clips = window.BeatflowClips?.getUploadedClips() ?? [];
      clips.forEach(clipFile => payload.append('clips', clipFile));
      for (const [key, value] of formData.entries()) {
        payload.append(key, value);
      }
      for (const genre of state.genres) {
        payload.append('genres', genre);
      }
      payload.append('overlayEnabled', String(isOverlayEnabled()));
      payload.append('overlayTheme', getOverlayTheme());
      return payload;
    }
  };
}
