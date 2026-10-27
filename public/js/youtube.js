import { generateClientMetadata } from './metadata-client.js';

function getEl(id) {
  return document.getElementById(id);
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function waitForJobCompletion(jobId) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const source = new EventSource(`/api/jobs/${jobId}/events`);

    const finish = (handler) => (event) => {
      if (settled) return;
      settled = true;
      source.close();
      handler(event);
    };

    const handleComplete = finish((event) => {
      const data = JSON.parse(event.data);
      updateProgress(data);
      applyVideoPreview(data);
      resolve(data);
    });

    const handleError = finish((event) => {
      let message = 'Conversion failed';
      if (event?.data) {
        try {
          const data = JSON.parse(event.data);
          message = data.error || message;
        } catch {
          // use default message
        }
      }
      showConversionError(message);
      reject(new Error(message));
    });

    source.addEventListener('snapshot', (event) => {
      const data = JSON.parse(event.data);
      updateProgress(data);
      if (data.status === 'complete' || data.status === 'ready') {
        if (!settled) {
          settled = true;
          source.close();
          applyVideoPreview(data);
          resolve(data);
        }
      }
      if (data.status === 'error') {
        handleError({ data: JSON.stringify({ error: data.error }) });
      }
    });
    source.addEventListener('progress', (event) => updateProgress(JSON.parse(event.data)));
    source.addEventListener('complete', handleComplete);
    source.addEventListener('error', handleError);
    source.onerror = () => {
      if (!settled) {
        handleError({ data: JSON.stringify({ error: 'Progress stream closed unexpectedly' }) });
      }
    };
  });
}

function showConversionError(message) {
  const conversionLabel = getEl('conversionLabel');
  const publishStatus = getEl('publishStatus');
  conversionLabel.textContent = message;
  publishStatus.textContent = message;
  updateProgress({ status: 'failed', progress: 0, label: message });

  const retryBtn = getEl('retryConversion');
  if (retryBtn) {
    retryBtn.style.display = 'block';
  }
}

function applyVideoPreview(data) {
  if (!data?.outputFile) return;

  window._beatflow = window._beatflow || {};
  window._beatflow.outputFile = data.outputFile;
  window._beatflow.outputPath = data.outputPath;

  const previewVideo = getEl('videoPreview');
  if (previewVideo) {
    previewVideo.src = `/api/upload/preview/${data.outputFile}`;
    previewVideo.load();
    previewVideo.play().catch(() => {});
    previewVideo.classList.remove('hidden');
  }

  const previewImage = getEl('previewImage');
  if (previewImage && data.thumbnailPath) {
    // Keep thumbnail visible as poster when video element is absent
    previewImage.dataset.videoFile = data.outputFile;
  }
}

function updateProgress(data) {
  const progressBar = getEl('conversionProgress');
  const uploadProgress = getEl('uploadProgress');
  const conversionLabel = getEl('conversionLabel');
  const publishStatus = getEl('publishStatus');
  const jobStatus = getEl('jobStatus');
  const status = data.status || 'working';
  const progress = Number(data.progress || 0);
  const label = data.label || `${status} - ${progress}%`;
  progressBar.style.width = `${progress}%`;
  uploadProgress.style.width = `${progress}%`;
  conversionLabel.textContent = label;
  publishStatus.textContent = label;
  if (jobStatus) {
    jobStatus.textContent = label;
  }
}

export function createYoutubeController(appState, uploader, form) {
  const connectionStatus = getEl('connectionStatus');
  const publishConnectionCard = getEl('publishConnectionCard');
  const successCard = getEl('successCard');
  const publishButton = getEl('publishButton');
  const privacySelect = getEl('privacySelect');

  let scheduleMode = 'now';
  let scheduledDateTime = null;

  function connect(url) {
    window.location.href = url || '/auth/login';
  }

  function toLocalInputValue(date) {
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
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

  function setConnection(connected, profile, configured = true) {
    appState.youtube = { connected, profile, configured };
    let label = 'YouTube not connected';
    if (!configured) {
      label = 'YouTube not configured (.env)';
    } else if (connected) {
      label = `Connected: ${profile?.title || 'YouTube channel'}`;
    }
    connectionStatus.textContent = label;
    publishConnectionCard.textContent = label;
    connectionStatus.classList.toggle('connected', connected);
  }

  async function refreshStatus() {
    try {
      const response = await fetch('/auth/status');
      const data = await readJson(response);
      setConnection(Boolean(data.connected), data.profile, data.configured !== false);
    } catch {
      setConnection(false, null, false);
    }
  }

  async function publish() {
    successCard.classList.add('hidden');
    if (!appState.metadata || !appState.beatData) {
      throw new Error('Generate metadata before publishing.');
    }

    // Validate scheduled time if in schedule mode
    if (scheduleMode === 'schedule') {
      const val = getEl('schedule-datetime').value;
      if (!val) {
        showToast('Please choose a date and time, or switch to Publish now', 'error');
        throw new Error('Scheduled time required');
      }
      scheduledDateTime = new Date(val).toISOString();
    }

    const draft = form.getDraft();
    const uploadResponse = await fetch('/api/upload', {
      method: 'POST',
      body: uploader.getPayload(new FormData(document.getElementById('beatForm')))
    });
    const uploadData = await readJson(uploadResponse);

    await waitForJobCompletion(uploadData.jobId);

    const metadata = generateClientMetadata(appState.beatData);
    let publishSource;
    try {
      publishSource = new EventSource(`/api/jobs/${uploadData.jobId}/events`);
      publishSource.addEventListener('snapshot', (event) => updateProgress(JSON.parse(event.data)));
      publishSource.addEventListener('progress', (event) => updateProgress(JSON.parse(event.data)));
      publishSource.addEventListener('complete', (event) => {
        updateProgress(JSON.parse(event.data));
        publishSource.close();
      });
      publishSource.addEventListener('error', () => publishSource.close());

      const payload = {
        jobId: uploadData.jobId,
        privacyStatus: privacySelect.value,
        title: draft.title || metadata.title,
        description: draft.description || metadata.description
      };

      if (scheduleMode === 'schedule' && scheduledDateTime) {
        payload.scheduledFor = scheduledDateTime;
      }

      const publishResponse = await fetch('/api/youtube/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await readJson(publishResponse);

      successCard.classList.remove('hidden');
      if (result.scheduledFor) {
        const scheduledDate = new Date(result.scheduledFor).toLocaleString();
        successCard.innerHTML = `
          <strong>${result.title}</strong>
          <div>Scheduled for: ${scheduledDate}</div>
          <div><a href="${result.url}" target="_blank" rel="noreferrer">View on YouTube</a></div>
        `;
      } else {
        successCard.innerHTML = `
          <strong>${result.title}</strong>
          <div><a href="${result.url}" target="_blank" rel="noreferrer">${result.url}</a></div>
          <button id="copyLinkButton" class="secondary-button" type="button">Copy link</button>
        `;
        getEl('copyLinkButton').addEventListener('click', async () => {
          await navigator.clipboard.writeText(result.url);
        });
      }
    } finally {
      publishSource?.close();
    }
  }

  const retryBtn = getEl('retryConversion');
  if (retryBtn) {
    retryBtn.addEventListener('click', async () => {
      retryBtn.style.display = 'none';
      getEl('conversionLabel').textContent = 'Retrying conversion...';
      try {
        publishButton.disabled = true;
        await publish();
      } catch (error) {
        showConversionError(error.message);
      } finally {
        publishButton.disabled = false;
      }
    });
  }

  getEl('connectYouTubeTop').addEventListener('click', () => connect());
  getEl('connectYouTubeBottom').addEventListener('click', () => connect());

  // Scheduling UI logic
  document.querySelectorAll('.schedule-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.schedule-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      scheduleMode = btn.dataset.mode;
      getEl('schedule-datetime-row').style.display =
        scheduleMode === 'schedule' ? 'flex' : 'none';
      getEl('schedule-suggestion').style.display = 'none';
    });
  });

  getEl('suggest-time-btn')?.addEventListener('click', async () => {
    const btn = getEl('suggest-time-btn');
    btn.textContent = 'Thinking…';
    btn.disabled = true;

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Pull the first selected genre chip to inform the suggestion
      const selectedGenres = [...document.querySelectorAll('.chip.is-active')].map(c => c.dataset.genre);
      const primaryGenre   = selectedGenres[0] || '';

      const params = new URLSearchParams({ timezone, genre: primaryGenre });
      const res = await fetch(`/api/scheduling/suggest?${params}`);
      const json = await res.json();

      const dt = new Date(json.recommendation);
      getEl('schedule-datetime').value = toLocalInputValue(dt);

      const suggestionBox = getEl('schedule-suggestion');
      getEl('schedule-suggestion-text').textContent = json.basis;
      const badge = getEl('schedule-confidence-badge');
      badge.textContent = json.confidence === 'high' ? 'Based on your data' : 'General default';
      badge.className = `schedule-confidence-badge schedule-confidence-badge--${json.confidence}`;
      suggestionBox.style.display = 'block';

    } catch (err) {
      showToast('Could not generate a suggestion right now', 'error');
    } finally {
      btn.textContent = '✨ Suggest best time';
      btn.disabled = false;
    }
  });

  getEl('publishButton').addEventListener('click', async () => {
    try {
      publishButton.disabled = true;
      publishButton.classList.add('loading');
      publishButton.textContent = 'Publishing…';
      await publish();
    } catch (error) {
      showConversionError(error.message);
    } finally {
      publishButton.disabled = false;
      publishButton.classList.remove('loading');
      publishButton.textContent = 'Publish to YouTube';
    }
  });

  // Delegated feedback for copy link button
  document.addEventListener('click', async (event) => {
    const copyBtn = event.target.closest('#copyLinkButton') || (event.target.id?.includes('copyLink') ? event.target : null);
    if (!copyBtn) return;

    const originalText = copyBtn.textContent;
    try {
      const url = copyBtn.closest('[data-video-url]')?.dataset.videoUrl ||
        copyBtn.previousElementSibling?.href ||
        successCard.querySelector('a[href]')?.href || '';

      if (url) {
        await navigator.clipboard.writeText(url);
        copyBtn.textContent = 'Copied ✓';
        copyBtn.classList.add('success');
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.classList.remove('success');
        }, 1500);
      }
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  });

  return { refreshStatus, setConnection };
}
