async function loadDashboard() {
  await Promise.all([loadBaseline(), loadVideoList()]);
}

async function loadBaseline() {
  const container = document.getElementById('dashboard-baseline');
  container.innerHTML = '<p class="dashboard-loading">Loading channel data…</p>';

  try {
    const res = await fetch('/api/analytics/baseline');
    const json = await res.json();
    const b = json.baseline;

    if (!b.available) {
      container.innerHTML = `
        <div class="dashboard-empty-state">
          <p>${escHtml(b.reason)}</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="baseline-stat">
        <span class="baseline-stat__value">${b.avgViewPercentage?.toFixed(1) ?? '--'}%</span>
        <span class="baseline-stat__label">Avg. view percentage</span>
      </div>
      <div class="baseline-stat">
        <span class="baseline-stat__value">${Math.round(b.avgViewsPerVideo ?? 0).toLocaleString()}</span>
        <span class="baseline-stat__label">Avg. views per video</span>
      </div>
      <div class="baseline-stat">
        <span class="baseline-stat__value">${b.sampledVideoCount}</span>
        <span class="baseline-stat__label">Videos in this sample</span>
      </div>`;
  } catch (err) {
    container.innerHTML = '<p class="dashboard-error">Could not load channel data.</p>';
  }
}

async function loadVideoList() {
  const container = document.getElementById('dashboard-video-list');
  container.innerHTML = '<p class="dashboard-loading">Loading uploads…</p>';

  try {
    const res = await fetch('/api/videos/history');
    const { history } = await res.json();

    if (!history.length) {
      container.innerHTML = `
        <div class="dashboard-empty-state">
          <p>No uploads yet. Publish your first beat to start tracking performance.</p>
        </div>`;
      return;
    }

    container.innerHTML = history.slice(0, 20).map(renderVideoCard).join('');

    // Fetch per-video metrics lazily, after initial render
    history.slice(0, 20).forEach(v => {
      if (v.videoId && v.status === 'published') hydrateVideoMetrics(v.videoId);
    });

  } catch (err) {
    container.innerHTML = '<p class="dashboard-error">Could not load upload history.</p>';
  }
}

function renderVideoCard(video) {
  const artists = video.artistB ? `${video.artistA} x ${video.artistB}` : video.artistA;
  const statusBadge = video.status === 'scheduled'
    ? `<span class="status-badge status-badge--scheduled">Scheduled for ${new Date(video.scheduledFor).toLocaleString()}</span>`
    : `<span class="status-badge status-badge--live">Live</span>`;

  return `
    <div class="video-card" data-video-id="${video.videoId}">
      <div class="video-card__header">
        <p class="video-card__title">${escHtml(video.title)}</p>
        ${statusBadge}
      </div>
      <p class="video-card__meta">${escHtml(artists)} · ${(video.genres ?? []).join(', ')}</p>
      <div class="video-card__metrics" id="metrics-${video.videoId}">
        <span class="metrics-loading">Loading metrics…</span>
      </div>
    </div>`;
}

async function hydrateVideoMetrics(videoId) {
  const el = document.getElementById(`metrics-${videoId}`);
  if (!el) return;

  try {
    const res = await fetch(`/api/analytics/video/${videoId}`);
    const { metrics } = await res.json();

    if (!metrics.available) {
      el.innerHTML = `<span class="metrics-unavailable">${escHtml(metrics.reason)}</span>`;
      return;
    }

    const verdict = buildVerdict(metrics);

    el.innerHTML = `
      <span class="metric-pill">${Number(metrics.views).toLocaleString()} views</span>
      <span class="metric-pill">${metrics.averageViewPercentage?.toFixed(0)}% avg watched</span>
      <span class="metric-pill">${metrics.likes ?? 0} likes</span>
      <span class="metric-verdict metric-verdict--${verdict.tone}">${escHtml(verdict.text)}</span>`;

  } catch (err) {
    el.innerHTML = '<span class="metrics-unavailable">Could not load metrics.</span>';
  }
}

/**
 * Plain-language verdict — NOT a fake score. Compares this video's view
 * percentage against a known healthy benchmark range for short-form music content.
 */
function buildVerdict(metrics) {
  const pct = metrics.averageViewPercentage;
  if (pct == null) return { text: 'Not enough data yet', tone: 'neutral' };
  if (pct >= 50) return { text: 'Strong retention', tone: 'positive' };
  if (pct >= 30) return { text: 'Solid retention', tone: 'positive' };
  if (pct >= 15) return { text: 'Average retention for this format', tone: 'neutral' };
  return { text: 'Lower retention — consider a shorter intro or stronger opening seconds', tone: 'caution' };
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.loadDashboard = loadDashboard;
