async function loadProfile() {
  try {
    const res  = await fetch('/api/profile');
    const json = await res.json();
    document.getElementById('settings-ig').value      = json.profile.instagramHandle ?? '';
    document.getElementById('settings-email').value   = json.profile.email ?? '';
    document.getElementById('settings-tagline').value = json.profile.channelTagline ?? '';
  } catch (err) {
    console.warn('[settings] Could not load profile:', err.message);
  }
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

async function saveProfileFromForm() {
  const btn = document.getElementById('settings-save-btn');
  btn.textContent = 'Saving…';
  btn.disabled = true;

  try {
    const res = await fetch('/api/profile', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instagramHandle: document.getElementById('settings-ig').value,
        email:           document.getElementById('settings-email').value,
        channelTagline:  document.getElementById('settings-tagline').value,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Could not save profile', 'error');
      return;
    }
    showToast('Profile saved ✓');
  } catch (err) {
    showToast('Could not save profile', 'error');
  } finally {
    btn.textContent = 'Save profile';
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('settings-save-btn')?.addEventListener('click', saveProfileFromForm);
});

export { loadProfile };
