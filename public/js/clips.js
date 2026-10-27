let uploadedClips = []; // { file: File, id: string, previewUrl: string }

function initClipsUpload() {
  const zone  = document.getElementById('clips-upload-zone');
  const grid  = document.getElementById('clips-preview-grid');
  if (!zone) return;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.accept = 'video/mp4,video/quicktime,video/webm';
  fileInput.style.display = 'none';
  zone.appendChild(fileInput);

  zone.addEventListener('click', () => fileInput.click());
  zone.querySelector('.btn-ghost')?.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => handleClipFiles([...e.target.files]));

  ['dragover', 'dragleave', 'drop'].forEach(evt => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.toggle('drag-over', evt === 'dragover');
    });
  });
  zone.addEventListener('drop', (e) => {
    handleClipFiles([...e.dataTransfer.files]);
  });
}

function handleClipFiles(files) {
  const validTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
  const maxSize = 100 * 1024 * 1024; // 100MB
  const maxClips = 20;

  for (const file of files) {
    if (uploadedClips.length >= maxClips) {
      showToast(`Maximum ${maxClips} clips allowed`, 'error');
      break;
    }
    if (!validTypes.includes(file.type)) {
      showToast(`"${file.name}" is not a supported video format`, 'error');
      continue;
    }
    if (file.size > maxSize) {
      showToast(`"${file.name}" exceeds the 100MB limit`, 'error');
      continue;
    }

    const id = `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const previewUrl = URL.createObjectURL(file);
    uploadedClips.push({ file, id, previewUrl });
  }

  renderClipsGrid();
}

function renderClipsGrid() {
  const grid = document.getElementById('clips-preview-grid');
  if (!grid) return;

  grid.innerHTML = uploadedClips.map(clip => `
    <div class="clip-card" data-clip-id="${clip.id}">
      <video class="clip-card__preview" src="${clip.previewUrl}" muted></video>
      <button class="clip-card__remove" data-id="${clip.id}" title="Remove">✕</button>
    </div>
  `).join('');

  grid.querySelectorAll('.clip-card__remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeClip(btn.dataset.id);
    });
  });

  // Hover-to-preview: play on mouseenter, pause+reset on mouseleave
  grid.querySelectorAll('.clip-card__preview').forEach(video => {
    video.addEventListener('mouseenter', () => video.play().catch(() => {}));
    video.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
  });
}

function removeClip(id) {
  const clip = uploadedClips.find(c => c.id === id);
  if (clip) URL.revokeObjectURL(clip.previewUrl);
  uploadedClips = uploadedClips.filter(c => c.id !== id);
  renderClipsGrid();
}

/** Exposed for uploader.js / form.js to attach clips to the conversion request */
function getUploadedClips() {
  return uploadedClips.map(c => c.file);
}

document.addEventListener('DOMContentLoaded', initClipsUpload);
window.BeatflowClips = { getUploadedClips };
