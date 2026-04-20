/* ============================================
   IT Ticketing System — Notification System
   ============================================ */

const NotificationStore = {
  KEY: 'tickethub_notifications',

  getAll() {
    const data = localStorage.getItem(this.KEY);
    return data ? JSON.parse(data) : [];
  },

  save(notifications) {
    localStorage.setItem(this.KEY, JSON.stringify(notifications));
  },

  add(notification) {
    const notifications = this.getAll();
    notifications.unshift({
      id: Date.now().toString(),
      ...notification,
      read: false,
      timestamp: new Date().toISOString()
    });
    // Keep max 50 notifications
    if (notifications.length > 50) notifications.length = 50;
    this.save(notifications);
  },

  markAllRead() {
    const notifications = this.getAll().map(n => ({ ...n, read: true }));
    this.save(notifications);
  },

  clear() {
    localStorage.removeItem(this.KEY);
  },

  getUnreadCount() {
    return this.getAll().filter(n => !n.read).length;
  }
};

// ==========================================
// ADD NOTIFICATION
// ==========================================
function addNotification(type, title, message) {
  NotificationStore.add({ type, title, message });
  updateNotificationBadge();
  renderNotificationDropdown();
}

// ==========================================
// TOGGLE DROPDOWN
// ==========================================
function toggleNotifications() {
  const dropdown = document.getElementById('notification-dropdown');
  dropdown.classList.toggle('active');
  if (dropdown.classList.contains('active')) {
    renderNotificationDropdown();
  }
}

// ==========================================
// RENDER DROPDOWN
// ==========================================
function renderNotificationDropdown() {
  const notifications = NotificationStore.getAll();
  const list = document.getElementById('notification-list');

  if (notifications.length === 0) {
    list.innerHTML = `
      <div class="notification-empty">
        <div style="font-size: 32px; margin-bottom: 8px; opacity: 0.5;">🔔</div>
        Belum ada notifikasi
      </div>
    `;
    return;
  }

  list.innerHTML = notifications.slice(0, 20).map(n => {
    const icons = {
      info: { emoji: 'ℹ️', class: 'info' },
      success: { emoji: '✅', class: 'success' },
      warning: { emoji: '⚠️', class: 'warning' },
      danger: { emoji: '🚨', class: 'danger' }
    };
    const icon = icons[n.type] || icons.info;

    return `
      <div class="notification-item ${n.read ? '' : 'unread'}">
        <div class="notification-icon ${icon.class}">${icon.emoji}</div>
        <div class="notification-content">
          <div class="notification-text"><strong>${escapeHtml(n.title)}</strong><br>${escapeHtml(n.message)}</div>
          <div class="notification-time">${formatTimeAgo(n.timestamp)}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// BADGE
// ==========================================
function updateNotificationBadge() {
  const count = NotificationStore.getUnreadCount();
  const badge = document.getElementById('notif-badge');
  badge.textContent = count;
  badge.style.display = count > 0 ? '' : 'none';
}

// ==========================================
// ACTIONS
// ==========================================
function clearAllNotifications() {
  NotificationStore.markAllRead();
  updateNotificationBadge();
  renderNotificationDropdown();
}

// ==========================================
// TIME AGO FORMATTER
// ==========================================
function formatTimeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'Baru saja';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} menit yang lalu`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} jam yang lalu`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} hari yang lalu`;
  return formatDate(dateStr);
}

// ==========================================
// INIT NOTIFICATIONS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  updateNotificationBadge();
});
