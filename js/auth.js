/* ============================================
   IT Ticketing System — Authentication Logic
   ============================================ */

const AUTH_KEY = 'tickethub_auth';
const USERS_KEY = 'tickethub_users';

// ==========================================
// USER STORE
// ==========================================
const UserStore = {
  getAll() {
    const data = localStorage.getItem(USERS_KEY);
    return data ? JSON.parse(data) : [];
  },

  save(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  findByEmail(email) {
    return this.getAll().find(u => u.email.toLowerCase() === email.toLowerCase());
  },

  create(userData) {
    const users = this.getAll();

    // Check duplicate email
    if (users.find(u => u.email.toLowerCase() === userData.email.toLowerCase())) {
      throw new Error('Email sudah terdaftar');
    }

    // Check duplicate personal number
    if (users.find(u => u.personalNumber === userData.personalNumber)) {
      throw new Error('Personal number sudah terdaftar');
    }

    const user = {
      id: 'USR-' + Date.now().toString(36).toUpperCase(),
      email: userData.email,
      name: userData.name,
      personalNumber: userData.personalNumber,
      role: userData.role,
      password: hashPassword(userData.password),
      createdAt: new Date().toISOString()
    };

    users.push(user);
    this.save(users);
    return user;
  }
};

// ==========================================
// SIMPLE HASH (for demo — NOT production-safe)
// ==========================================
function hashPassword(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'hashed_' + Math.abs(hash).toString(36) + '_' + btoa(password).slice(0, 8);
}

function verifyPassword(password, hashed) {
  return hashPassword(password) === hashed;
}

// ==========================================
// AUTH SESSION
// ==========================================
function setAuth(user) {
  const session = {
    id: user.id,
    email: user.email,
    name: user.name,
    personalNumber: user.personalNumber,
    role: user.role,
    loginAt: new Date().toISOString()
  };
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

function getAuth() {
  const data = localStorage.getItem(AUTH_KEY);
  return data ? JSON.parse(data) : null;
}

function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

// ==========================================
// TAB SWITCHING
// ==========================================
function switchTab(tab) {
  // Update tabs
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  // Update panels
  document.querySelectorAll('.auth-panel').forEach(p => {
    p.classList.remove('active');
  });
  const panel = document.getElementById(`panel-${tab}`);
  if (panel) panel.classList.add('active');

  // Clear errors
  hideError('login');
  hideError('register');
  hideSuccess('register');

  // Update URL without reload
  const url = new URL(window.location);
  url.searchParams.set('tab', tab);
  history.replaceState(null, '', url);

  // Update title
  document.title = tab === 'register' ? 'Satkomindo — Register' : 'Satkomindo — Login';
}

// ==========================================
// LOGIN HANDLER
// ==========================================
function handleLogin(event) {
  event.preventDefault();
  hideError('login');

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  // Find user
  const user = UserStore.findByEmail(email);
  if (!user) {
    showError('login', 'Akun dengan email ini tidak ditemukan');
    return;
  }

  // Verify password
  if (!verifyPassword(password, user.password)) {
    showError('login', 'Password yang Anda masukkan salah');
    return;
  }

  // Set auth session
  setAuth(user);

  // Show toast
  showAuthToast('success', `Selamat datang, ${user.name}!`);

  // Redirect to dashboard
  setTimeout(() => {
    window.location.href = 'index.html';
  }, 800);
}

// ==========================================
// REGISTER HANDLER
// ==========================================
function handleRegister(event) {
  event.preventDefault();
  hideError('register');
  hideSuccess('register');

  const email = document.getElementById('reg-email').value.trim();
  const name = document.getElementById('reg-name').value.trim();
  const personalNumber = document.getElementById('reg-personal-number').value.trim();
  const role = document.getElementById('reg-role').value;
  const password = document.getElementById('reg-password').value;
  const confirmPassword = document.getElementById('reg-confirm-password').value;

  // Validation
  if (password.length < 6) {
    showError('register', 'Password minimal 6 karakter');
    return;
  }

  if (password !== confirmPassword) {
    showError('register', 'Password dan konfirmasi password tidak cocok');
    return;
  }

  if (!document.getElementById('agree-terms').checked) {
    showError('register', 'Anda harus menyetujui ketentuan penggunaan');
    return;
  }

  try {
    const user = UserStore.create({ email, name, personalNumber, role, password });

    // Show success
    showSuccess('register', `Akun berhasil dibuat! Silakan login dengan email ${email}`);
    showAuthToast('success', 'Registrasi berhasil!');

    // Reset form
    document.getElementById('register-form').reset();
    resetPasswordStrength();

    // Auto switch to login after delay
    setTimeout(() => {
      switchTab('login');
      document.getElementById('login-email').value = email;
      document.getElementById('login-email').focus();
    }, 1500);

  } catch (err) {
    showError('register', err.message);
  }
}

// ==========================================
// PASSWORD VISIBILITY TOGGLE
// ==========================================
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
}

// ==========================================
// PASSWORD STRENGTH CHECKER
// ==========================================
function checkPasswordStrength(password) {
  const bars = [
    document.getElementById('str-bar-1'),
    document.getElementById('str-bar-2'),
    document.getElementById('str-bar-3'),
    document.getElementById('str-bar-4')
  ];
  const textEl = document.getElementById('password-strength-text');

  // Reset
  bars.forEach(b => b.className = 'password-strength-bar');
  textEl.className = 'password-strength-text';
  textEl.textContent = '';

  if (!password) return;

  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  let strength, label;
  if (score <= 1) {
    strength = 'weak';
    label = 'Lemah';
  } else if (score <= 3) {
    strength = 'medium';
    label = 'Sedang';
  } else {
    strength = 'strong';
    label = 'Kuat';
  }

  const activeCount = strength === 'weak' ? 1 : strength === 'medium' ? 2 : 4;
  for (let i = 0; i < activeCount; i++) {
    bars[i].classList.add(strength);
  }

  textEl.classList.add(strength);
  textEl.textContent = `Password ${label}`;
}

function resetPasswordStrength() {
  const bars = document.querySelectorAll('.password-strength-bar');
  bars.forEach(b => b.className = 'password-strength-bar');
  const textEl = document.getElementById('password-strength-text');
  if (textEl) {
    textEl.className = 'password-strength-text';
    textEl.textContent = '';
  }
}

// ==========================================
// ERROR / SUCCESS MESSAGES
// ==========================================
function showError(form, message) {
  const el = document.getElementById(`${form}-error`);
  const textEl = document.getElementById(`${form}-error-text`);
  if (el && textEl) {
    textEl.textContent = message;
    el.classList.add('visible');
  }
}

function hideError(form) {
  const el = document.getElementById(`${form}-error`);
  if (el) el.classList.remove('visible');
}

function showSuccess(form, message) {
  const el = document.getElementById(`${form}-success`);
  const textEl = document.getElementById(`${form}-success-text`);
  if (el && textEl) {
    textEl.textContent = message;
    el.classList.add('visible');
  }
}

function hideSuccess(form) {
  const el = document.getElementById(`${form}-success`);
  if (el) el.classList.remove('visible');
}

// ==========================================
// TOAST
// ==========================================
function showAuthToast(type, message) {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-removing');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==========================================
// INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // Check URL params for tab
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  if (tab === 'register') {
    switchTab('register');
  }

  // If already logged in, redirect
  const auth = getAuth();
  if (auth) {
    window.location.href = 'index.html';
    return;
  }

  // Seed a default admin user if no users exist
  const users = UserStore.getAll();
  if (users.length === 0) {
    try {
      UserStore.create({
        email: 'admin@satkomindo.com',
        name: 'IT Administrator',
        personalNumber: 'ADM-001',
        role: 'Admin',
        password: 'admin123'
      });
    } catch (e) {}
  }
});
