import { createUploader } from './uploader.js';
import { createFormController, previewTitle } from './form.js';
import { createYoutubeController } from './youtube.js';
import { initDrafts } from './drafts.js';

const state = {
  beatData: null,
  metadata: null,
  uploaded: null,
  youtube: null
};

function setStep(step) {
  document.querySelectorAll('.step').forEach((button) => {
    button.classList.toggle('is-active', Number(button.dataset.step) === step);
  });
  document.querySelectorAll('.panel').forEach((panel) => {
    const panelNum = Number(panel.dataset.panel);
    const shouldBeVisible = panelNum === step;
    const isVisible = panel.classList.contains('is-visible');
    
    if (shouldBeVisible && !isVisible) {
      // Entering
      panel.classList.add('is-visible');
    } else if (!shouldBeVisible && isVisible) {
      // Exiting
      panel.classList.add('step-exit');
      setTimeout(() => {
        panel.classList.remove('is-visible', 'step-exit');
      }, 200);
    }
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  const uploader = createUploader(state);
  const form = createFormController(state, uploader);
  const youtube = createYoutubeController(state, uploader, form);
  initDrafts(uploader, previewTitle);

  // Navigation between Upload and Dashboard views
  document.querySelectorAll('.nav-link').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view, .wizard-view').forEach(v => v.style.display = 'none');

      if (btn.dataset.view === 'dashboard') {
        document.getElementById('dashboard-view').style.display = 'block';
        document.getElementById('upload-stepper').style.display = 'none';
        document.querySelectorAll('.panels').forEach(p => p.style.display = 'none');
        if (window.loadDashboard) window.loadDashboard();
      } else if (btn.dataset.view === 'settings') {
        document.getElementById('settings-view').style.display = 'block';
        document.getElementById('upload-stepper').style.display = 'none';
        document.querySelectorAll('.panels').forEach(p => p.style.display = 'none');
        import('./settings.js').then(m => m.loadProfile());
      } else {
        document.getElementById('dashboard-view').style.display = 'none';
        document.getElementById('settings-view').style.display = 'none';
        document.getElementById('upload-stepper').style.display = 'flex';
        document.querySelectorAll('.panels').forEach(p => p.style.display = 'flex');
      }
    });
  });

  document.querySelectorAll('.step').forEach((button) => {
    button.addEventListener('click', () => setStep(Number(button.dataset.step)));
  });

  document.getElementById('generatePreview').addEventListener('click', async () => {
    const metadata = await form.generatePreview();
    if (metadata) {
      setStep(2);
    }
  });

  document.getElementById('backToUpload').addEventListener('click', () => setStep(1));
  document.getElementById('toPublish').addEventListener('click', () => setStep(3));
  document.getElementById('backToPreview').addEventListener('click', () => setStep(2));
  document.getElementById('regenerateMetadata').addEventListener('click', async () => {
    await form.generatePreview();
  });

  await youtube.refreshStatus();
  setStep(1);
});
