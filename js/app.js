/* ============================================
   IT Ticketing System — Core Application Logic
   ============================================ */

// ==========================================
// CONSTANTS
// ==========================================
const SLA_TARGETS = {
  Critical: 4,    // hours
  High: 8,
  Medium: 24,
  Low: 48
};

const STATUSES = ['Open', 'In Progress', 'Pending', 'Resolved', 'Closed'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const CATEGORIES = ['Hardware', 'Software', 'Network', 'Access', 'Email', 'Other'];
const DEPARTMENTS = ['IT', 'HR', 'Finance', 'Marketing', 'Operations', 'Sales', 'Management'];

const ITEMS_PER_PAGE = 10;
let currentPage = 1;

// ==========================================
// TICKET STORE (localStorage CRUD)
// ==========================================
const TicketStore = {
  KEY: 'tickethub_tickets',
  COUNTER_KEY: 'tickethub_counter',

  getAll() {
    const data = localStorage.getItem(this.KEY);
    return data ? JSON.parse(data) : [];
  },

  save(tickets) {
    localStorage.setItem(this.KEY, JSON.stringify(tickets));
  },

  getById(id) {
    return this.getAll().find(t => t.id === id);
  },

  create(ticketData) {
    const tickets = this.getAll();
    const counter = this.getNextCounter();
    const now = new Date().toISOString();
    const dateStr = now.slice(0, 10).replace(/-/g, '');

    const ticket = {
      id: `TKT-${dateStr}-${String(counter).padStart(4, '0')}`,
      title: ticketData.title,
      description: ticketData.description,
      category: ticketData.category,
      priority: ticketData.priority,
      status: 'Open',
      requester: ticketData.requester,
      department: ticketData.department,
      assignee: ticketData.assignee || 'IT Support',
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      closedAt: null,
      slaTarget: SLA_TARGETS[ticketData.priority],
      slaElapsed: 0,
      slaPausedAt: null,
      slaTotalPaused: 0,
      slaBreached: false,
      ttr: null,
      notes: []
    };

    tickets.unshift(ticket);
    this.save(tickets);
    return ticket;
  },

  update(id, updates) {
    const tickets = this.getAll();
    const idx = tickets.findIndex(t => t.id === id);
    if (idx === -1) return null;

    tickets[idx] = { ...tickets[idx], ...updates, updatedAt: new Date().toISOString() };
    this.save(tickets);
    return tickets[idx];
  },

  delete(id) {
    const tickets = this.getAll().filter(t => t.id !== id);
    this.save(tickets);
  },

  getNextCounter() {
    let counter = parseInt(localStorage.getItem(this.COUNTER_KEY) || '0') + 1;
    localStorage.setItem(this.COUNTER_KEY, counter.toString());
    return counter;
  },

  clear() {
    localStorage.removeItem(this.KEY);
    localStorage.removeItem(this.COUNTER_KEY);
  }
};

// ==========================================
// SLA ENGINE
// ==========================================
const SLAEngine = {
  // Calculate elapsed SLA time in hours (excluding paused time)
  calculateElapsed(ticket) {
    if (!ticket) return 0;
    const now = new Date();
    const created = new Date(ticket.createdAt);
    
    let totalMs = 0;

    if (ticket.status === 'Resolved' || ticket.status === 'Closed') {
      const end = new Date(ticket.resolvedAt || ticket.closedAt || ticket.updatedAt);
      totalMs = end - created;
    } else if (ticket.status === 'Pending') {
      // Timer is paused at slaPausedAt
      if (ticket.slaPausedAt) {
        totalMs = new Date(ticket.slaPausedAt) - created;
      } else {
        totalMs = now - created;
      }
    } else {
      totalMs = now - created;
    }

    // Subtract paused time
    const pausedMs = (ticket.slaTotalPaused || 0) * 3600 * 1000;
    totalMs = Math.max(0, totalMs - pausedMs);

    return totalMs / (3600 * 1000); // Convert to hours
  },

  // Get SLA status: 'on-track', 'at-risk', 'breached'
  getStatus(ticket) {
    if (!ticket) return 'on-track';
    if (ticket.slaBreached) return 'breached';

    const elapsed = this.calculateElapsed(ticket);
    const target = ticket.slaTarget || SLA_TARGETS[ticket.priority] || 24;
    const ratio = elapsed / target;

    if (ratio >= 1) return 'breached';
    if (ratio >= 0.75) return 'at-risk';
    return 'on-track';
  },

  // Get progress percentage (0-100+)
  getProgress(ticket) {
    const elapsed = this.calculateElapsed(ticket);
    const target = ticket.slaTarget || SLA_TARGETS[ticket.priority] || 24;
    return Math.min((elapsed / target) * 100, 120);
  },

  // Handle status transition for SLA tracking
  handleStatusChange(ticket, oldStatus, newStatus) {
    const now = new Date().toISOString();
    const updates = {};

    // Transitioning TO Pending: pause timer
    if (newStatus === 'Pending' && oldStatus !== 'Pending') {
      updates.slaPausedAt = now;
    }

    // Transitioning FROM Pending: resume timer, accumulate paused time
    if (oldStatus === 'Pending' && newStatus !== 'Pending' && ticket.slaPausedAt) {
      const pausedDuration = (new Date(now) - new Date(ticket.slaPausedAt)) / (3600 * 1000);
      updates.slaTotalPaused = (ticket.slaTotalPaused || 0) + pausedDuration;
      updates.slaPausedAt = null;
    }

    // Transitioning to Resolved
    if (newStatus === 'Resolved') {
      updates.resolvedAt = now;
      const elapsed = this.calculateElapsed({ ...ticket, ...updates, resolvedAt: now, status: 'Resolved' });
      updates.ttr = Math.round(elapsed * 100) / 100;
      updates.slaBreached = elapsed > (ticket.slaTarget || SLA_TARGETS[ticket.priority]);
    }

    // Transitioning to Closed
    if (newStatus === 'Closed') {
      updates.closedAt = now;
      if (!ticket.resolvedAt) {
        updates.resolvedAt = now;
        const elapsed = this.calculateElapsed({ ...ticket, ...updates, resolvedAt: now, status: 'Closed' });
        updates.ttr = Math.round(elapsed * 100) / 100;
        updates.slaBreached = elapsed > (ticket.slaTarget || SLA_TARGETS[ticket.priority]);
      }
    }

    // Update breach status for active tickets
    if (newStatus !== 'Resolved' && newStatus !== 'Closed') {
      const elapsed = this.calculateElapsed({ ...ticket, ...updates, status: newStatus });
      updates.slaBreached = elapsed > (ticket.slaTarget || SLA_TARGETS[ticket.priority]);
    }

    updates.status = newStatus;
    return updates;
  }
};

// ==========================================
// TTR CALCULATOR
// ==========================================
const TTRCalculator = {
  getAverageTTR(tickets) {
    const resolved = tickets.filter(t => t.ttr != null);
    if (resolved.length === 0) return 0;
    const sum = resolved.reduce((acc, t) => acc + t.ttr, 0);
    return Math.round((sum / resolved.length) * 100) / 100;
  },

  getAverageTTRByCategory(tickets) {
    const result = {};
    CATEGORIES.forEach(cat => {
      const catTickets = tickets.filter(t => t.category === cat && t.ttr != null);
      if (catTickets.length > 0) {
        result[cat] = Math.round((catTickets.reduce((a, t) => a + t.ttr, 0) / catTickets.length) * 100) / 100;
      } else {
        result[cat] = 0;
      }
    });
    return result;
  },

  getAverageTTRByPriority(tickets) {
    const result = {};
    PRIORITIES.forEach(p => {
      const pTickets = tickets.filter(t => t.priority === p && t.ttr != null);
      if (pTickets.length > 0) {
        result[p] = Math.round((pTickets.reduce((a, t) => a + t.ttr, 0) / pTickets.length) * 100) / 100;
      } else {
        result[p] = 0;
      }
    });
    return result;
  }
};

// ==========================================
// NAVIGATION
// ==========================================
const PAGE_TITLES = {
  'dashboard': { title: 'Dashboard', subtitle: 'Overview performa IT service desk' },
  'create-ticket': { title: 'Buat Tiket', subtitle: 'Buat permintaan dukungan IT baru' },
  'ticket-list': { title: 'Daftar Tiket', subtitle: 'Kelola semua tiket dukungan IT' },
  'reports': { title: 'Reports & SLA', subtitle: 'Analisis performa dan kepatuhan SLA' },
  'data-management': { title: 'Data Management', subtitle: 'Export, import, dan kelola data' }
};

function navigateTo(page) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  // Show target page
  const targetPage = document.getElementById(`page-${page}`);
  if (targetPage) targetPage.classList.add('active');

  // Update nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  // Update header
  const info = PAGE_TITLES[page] || { title: 'Dashboard', subtitle: '' };
  document.getElementById('page-title').textContent = info.title;
  document.getElementById('page-subtitle').textContent = info.subtitle;

  // Refresh page data
  if (page === 'dashboard') refreshDashboard();
  if (page === 'ticket-list') renderTicketList();
  if (page === 'reports') refreshReports();

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('mobile-open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('mobile-open');
}

// ==========================================
// CREATE TICKET
// ==========================================
function handleCreateTicket(event) {
  event.preventDefault();

  const ticketData = {
    title: document.getElementById('ticket-title').value.trim(),
    description: document.getElementById('ticket-description').value.trim(),
    category: document.getElementById('ticket-category').value,
    priority: document.getElementById('ticket-priority').value,
    requester: document.getElementById('ticket-requester').value.trim(),
    department: document.getElementById('ticket-department').value,
    assignee: document.getElementById('ticket-assignee').value.trim() || 'IT Support'
  };

  const ticket = TicketStore.create(ticketData);
  logToGoogleSheet("CREATE_TICKET", ticket.id, ticketData);
  
  // Show toast
  showToast('success', `Tiket ${ticket.id} berhasil dibuat!`);
  
  // Add notification
  addNotification('info', `Tiket baru: ${ticket.id}`, `${ticket.title} — Prioritas: ${ticket.priority}`);

  // Reset form
  document.getElementById('create-ticket-form').reset();
  document.getElementById('ticket-assignee').value = 'IT Support';

  // Update badge
  updateOpenTicketCount();

  // Navigate to ticket list
  setTimeout(() => navigateTo('ticket-list'), 500);
}

// ==========================================
// TICKET LIST
// ==========================================
function renderTicketList() {
  const allTickets = TicketStore.getAll();
  
  // Apply filters
  const statusFilter = document.getElementById('filter-status').value;
  const priorityFilter = document.getElementById('filter-priority').value;
  const categoryFilter = document.getElementById('filter-category').value;
  const searchFilter = document.getElementById('filter-search').value.toLowerCase();

  let filtered = allTickets.filter(t => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    if (categoryFilter && t.category !== categoryFilter) return false;
    if (searchFilter) {
      const searchStr = `${t.id} ${t.title} ${t.requester} ${t.assignee} ${t.description}`.toLowerCase();
      if (!searchStr.includes(searchFilter)) return false;
    }
    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  if (currentPage > totalPages) currentPage = Math.max(1, totalPages);
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const paged = filtered.slice(start, start + ITEMS_PER_PAGE);

  // Update count label
  document.getElementById('ticket-count-label').textContent = 
    `Menampilkan ${paged.length} dari ${filtered.length} tiket`;

  // Render table
  const tbody = document.getElementById('ticket-list-body');
  if (paged.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <h3>Tidak ada tiket ditemukan</h3>
            <p>Coba ubah filter atau buat tiket baru</p>
            <button class="btn btn-primary btn-sm" onclick="navigateTo('create-ticket')">➕ Buat Tiket</button>
          </div>
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = paged.map(t => {
      const slaStatus = SLAEngine.getStatus(t);
      const slaProgress = SLAEngine.getProgress(t);
      const slaLabel = slaStatus === 'breached' ? 'Breach' : slaStatus === 'at-risk' ? 'At Risk' : 'On Track';
      const statusClass = t.status.toLowerCase().replace(' ', '-');
      
      return `
        <tr onclick="openTicketModal('${t.id}')">
          <td class="ticket-id-cell">${t.id}</td>
          <td class="ticket-title-cell" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</td>
          <td>${t.category}</td>
          <td><span class="priority-badge ${t.priority.toLowerCase()}">${t.priority}</span></td>
          <td><span class="status-badge ${statusClass}">${t.status}</span></td>
          <td>
            <span class="sla-badge ${slaStatus.replace(' ', '-')}">${slaLabel}</span>
            <div class="sla-progress"><div class="sla-progress-bar ${slaStatus.replace(' ', '-')}" style="width:${Math.min(slaProgress, 100)}%"></div></div>
          </td>
          <td>${escapeHtml(t.requester)}</td>
          <td>${formatDate(t.createdAt)}</td>
          <td>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation(); openTicketModal('${t.id}')" title="Detail">👁️</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Render pagination
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const container = document.getElementById('pagination');
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `
    <button class="pagination-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>
  `;

  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 7) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
      } else if (i === currentPage - 2 || i === currentPage + 2) {
        html += `<span class="pagination-info">...</span>`;
      }
    } else {
      html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
  }

  html += `
    <button class="pagination-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>›</button>
  `;

  container.innerHTML = html;
}

function goToPage(page) {
  currentPage = page;
  renderTicketList();
}

// ==========================================
// TICKET DETAIL MODAL
// ==========================================
function openTicketModal(ticketId) {
  const ticket = TicketStore.getById(ticketId);
  if (!ticket) return;

  const modal = document.getElementById('ticket-modal');
  const slaStatus = SLAEngine.getStatus(ticket);
  const slaProgress = SLAEngine.getProgress(ticket);
  const elapsed = SLAEngine.calculateElapsed(ticket);
  const statusClass = ticket.status.toLowerCase().replace(' ', '-');

  document.getElementById('modal-ticket-title').textContent = `Detail Tiket`;

  const body = document.getElementById('modal-ticket-body');
  body.innerHTML = `
    <div class="ticket-detail-header">
      <div>
        <div class="ticket-detail-id">${ticket.id}</div>
        <div class="ticket-detail-title">${escapeHtml(ticket.title)}</div>
      </div>
      <div class="quick-actions">
        <span class="priority-badge ${ticket.priority.toLowerCase()}">${ticket.priority}</span>
        <span class="status-badge ${statusClass}">${ticket.status}</span>
      </div>
    </div>

    <div class="ticket-detail-meta">
      <div class="ticket-meta-item">
        <span class="ticket-meta-label">Pelapor</span>
        <span class="ticket-meta-value">${escapeHtml(ticket.requester)}</span>
      </div>
      <div class="ticket-meta-item">
        <span class="ticket-meta-label">Department</span>
        <span class="ticket-meta-value">${ticket.department}</span>
      </div>
      <div class="ticket-meta-item">
        <span class="ticket-meta-label">Kategori</span>
        <span class="ticket-meta-value">${ticket.category}</span>
      </div>
      <div class="ticket-meta-item">
        <span class="ticket-meta-label">Assignee</span>
        <span class="ticket-meta-value">${escapeHtml(ticket.assignee)}</span>
      </div>
      <div class="ticket-meta-item">
        <span class="ticket-meta-label">Dibuat</span>
        <span class="ticket-meta-value">${formatDateTime(ticket.createdAt)}</span>
      </div>
      <div class="ticket-meta-item">
        <span class="ticket-meta-label">Diupdate</span>
        <span class="ticket-meta-value">${formatDateTime(ticket.updatedAt)}</span>
      </div>
      <div class="ticket-meta-item">
        <span class="ticket-meta-label">SLA Target</span>
        <span class="ticket-meta-value">${ticket.slaTarget} jam</span>
      </div>
      <div class="ticket-meta-item">
        <span class="ticket-meta-label">SLA Elapsed</span>
        <span class="ticket-meta-value">
          ${formatHours(elapsed)}
          <span class="sla-badge ${slaStatus}" style="margin-left:6px">${slaStatus === 'breached' ? '⚠️ Breach' : slaStatus === 'at-risk' ? '⏰ At Risk' : '✅ On Track'}</span>
        </span>
      </div>
      ${ticket.ttr != null ? `
      <div class="ticket-meta-item">
        <span class="ticket-meta-label">TTR</span>
        <span class="ticket-meta-value">${formatHours(ticket.ttr)}</span>
      </div>
      ` : ''}
    </div>

    <div class="sla-progress" style="height: 8px; margin-bottom: 24px;">
      <div class="sla-progress-bar ${slaStatus}" style="width:${Math.min(slaProgress, 100)}%"></div>
    </div>

    <div class="ticket-detail-section">
      <h3>📝 Deskripsi</h3>
      <div class="ticket-description">${escapeHtml(ticket.description) || '<em>Tidak ada deskripsi</em>'}</div>
    </div>

    ${ticket.status !== 'Closed' ? `
    <div class="ticket-detail-section">
      <h3>🔄 Update Status</h3>
      <div class="flex gap-8" style="flex-wrap:wrap">
        ${getAvailableTransitions(ticket.status).map(s => `
          <button class="btn ${s === 'Resolved' ? 'btn-success' : s === 'Closed' ? 'btn-ghost' : 'btn-primary'} btn-sm" 
                  onclick="updateTicketStatus('${ticket.id}', '${s}')">
            ${getStatusIcon(s)} ${s}
          </button>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <div class="ticket-detail-section">
      <h3>💬 Notes & Activity (${ticket.notes.length})</h3>
      ${ticket.notes.length > 0 ? `
        <div class="timeline">
          ${ticket.notes.map(n => `
            <div class="timeline-item">
              <div class="timeline-item-header">
                <span class="timeline-author">${escapeHtml(n.author)}</span>
                <span class="timeline-time">${formatDateTime(n.timestamp)}</span>
              </div>
              <div class="timeline-text">${escapeHtml(n.text)}</div>
            </div>
          `).join('')}
        </div>
      ` : '<p style="color: var(--text-muted); font-size: 14px;">Belum ada notes</p>'}
      
      ${ticket.status !== 'Closed' ? `
      <div class="add-note-form">
        <input type="text" class="form-input" id="note-input" placeholder="Tambah note..." onkeydown="if(event.key==='Enter'){addNote('${ticket.id}')}">
        <button class="btn btn-primary btn-sm" onclick="addNote('${ticket.id}')">Kirim</button>
      </div>
      ` : ''}
    </div>
  `;

  // Footer
  const footer = document.getElementById('modal-ticket-footer');
  footer.innerHTML = `
    <button class="btn btn-danger btn-sm" onclick="deleteTicket('${ticket.id}')">🗑️ Hapus</button>
    <button class="btn btn-ghost" onclick="closeTicketModal()">Tutup</button>
  `;

  modal.classList.add('active');
}

function closeTicketModal() {
  document.getElementById('ticket-modal').classList.remove('active');
}

function getAvailableTransitions(currentStatus) {
  const transitions = {
    'Open': ['In Progress', 'Pending', 'Closed'],
    'In Progress': ['Pending', 'Resolved', 'Closed'],
    'Pending': ['In Progress', 'Resolved', 'Closed'],
    'Resolved': ['Closed', 'In Progress'],
    'Closed': []
  };
  return transitions[currentStatus] || [];
}

function getStatusIcon(status) {
  const icons = {
    'Open': '📂',
    'In Progress': '🔧',
    'Pending': '⏸️',
    'Resolved': '✅',
    'Closed': '🔒'
  };
  return icons[status] || '';
}

function updateTicketStatus(ticketId, newStatus) {
  const ticket = TicketStore.getById(ticketId);
  if (!ticket) return;

  const oldStatus = ticket.status;
  const updates = SLAEngine.handleStatusChange(ticket, oldStatus, newStatus);
  
  // Ambil data SLA yang sudah dihitung app.js
  const timeElapsed = SLAEngine.calculateElapsed(ticket).toFixed(2);
  const slaStatus = SLAEngine.getStatus({ ...ticket, ...updates });

  // Add a note for the status change
  const notes = [...ticket.notes];
  notes.push({
    author: 'System',
    text: `Status berubah: ${oldStatus} → ${newStatus}`,
    timestamp: new Date().toISOString()
  });
  updates.notes = notes;

  TicketStore.update(ticketId, updates);

  // KIRIM LOG KE GOOGLE SHEETS
  const logData = {
    title: ticket.title,
    category: ticket.category,
    priority: ticket.priority,
    requester: ticket.requester,
    department: ticket.department,
    // Perbaikan: Properti ini yang digunakan oleh logToGoogleSheet
    description: `Status Change: ${oldStatus} -> ${newStatus} | SLA: ${timeElapsed} Menit (${slaStatus.toUpperCase()})`
  };
  
  logToGoogleSheet("STATUS_UPDATE", ticketId, logData);

  // Notification
  showToast('info', `Tiket ${ticketId} diupdate ke "${newStatus}"`);
  updateOpenTicketCount();
  
  addNotification(
    newStatus === 'Resolved' ? 'success' : newStatus === 'Closed' ? 'info' : 'warning',
    `Status Update: ${ticketId}`,
    `${oldStatus} → ${newStatus}`
  );

  // Check SLA breach
  if (updates.slaBreached && !ticket.slaBreached) {
    showToast('error', `⚠️ SLA Breach: Tiket ${ticketId}`);
    addNotification('danger', `SLA Breach!`, `Tiket ${ticketId} telah melewati batas SLA`);
  }

  updateOpenTicketCount();

  // Refresh modal
  openTicketModal(ticketId);
}

function addNote(ticketId) {
  const input = document.getElementById('note-input');
  const text = input.value.trim();
  if (!text) return;

  const ticket = TicketStore.getById(ticketId);
  if (!ticket) return;

  const notes = [...ticket.notes];
  notes.push({
    author: 'IT Admin',
    text: text,
    timestamp: new Date().toISOString()
  });

  TicketStore.update(ticketId, { notes });
  openTicketModal(ticketId);
}

function deleteTicket(ticketId) {
  if (!confirm(`Hapus tiket ${ticketId}? Aksi ini tidak dapat dikembalikan.`)) return;
  
  TicketStore.delete(ticketId);
  closeTicketModal();
  showToast('warning', `Tiket ${ticketId} dihapus`);
  updateOpenTicketCount();
  renderTicketList();
}

// ==========================================
// GLOBAL SEARCH
// ==========================================
function handleGlobalSearch(event) {
  if (event.key === 'Enter') {
    const query = event.target.value.trim();
    if (query) {
      navigateTo('ticket-list');
      document.getElementById('filter-search').value = query;
      renderTicketList();
    }
  }
}

// ==========================================
// DATA MANAGEMENT
// ==========================================
function exportJSON() {
  const tickets = TicketStore.getAll();
  const data = JSON.stringify(tickets, null, 2);
  downloadFile(data, `tickethub-backup-${formatDateFile(new Date())}.json`, 'application/json');
  showToast('success', `${tickets.length} tiket berhasil di-export`);
}

function exportCSV() {
  const tickets = TicketStore.getAll();
  const headers = ['ID', 'Title', 'Description', 'Category', 'Priority', 'Status', 'Requester', 'Department', 'Assignee', 'Created', 'Updated', 'Resolved', 'SLA Target (h)', 'SLA Breached', 'TTR (h)'];
  
  const rows = tickets.map(t => [
    t.id,
    `"${(t.title || '').replace(/"/g, '""')}"`,
    `"${(t.description || '').replace(/"/g, '""')}"`,
    t.category,
    t.priority,
    t.status,
    t.requester,
    t.department,
    t.assignee,
    t.createdAt,
    t.updatedAt,
    t.resolvedAt || '',
    t.slaTarget,
    t.slaBreached ? 'Yes' : 'No',
    t.ttr != null ? t.ttr : ''
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadFile(csv, `tickethub-export-${formatDateFile(new Date())}.csv`, 'text/csv');
  showToast('success', `${tickets.length} tiket berhasil di-export sebagai CSV`);
}

function importJSON() {
  const fileInput = document.getElementById('import-file');
  const file = fileInput.files[0];
  if (!file) {
    showToast('error', 'Pilih file JSON terlebih dahulu');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('Format tidak valid');
      
      const existing = TicketStore.getAll();
      const merged = [...data, ...existing];
      // Remove duplicates by ID
      const unique = merged.filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i);
      TicketStore.save(unique);
      
      showToast('success', `${data.length} tiket berhasil di-import (total: ${unique.length})`);
      updateOpenTicketCount();
      fileInput.value = '';
    } catch (err) {
      showToast('error', 'Gagal import: format file tidak valid');
    }
  };
  reader.readAsText(file);
}

function resetAllData() {
  if (!confirm('⚠️ Hapus SEMUA data tiket? Aksi ini tidak dapat dikembalikan!')) return;
  if (!confirm('Apakah Anda yakin? Semua data akan hilang permanen.')) return;
  
  TicketStore.clear();
  clearAllNotifications();
  showToast('warning', 'Semua data telah dihapus');
  updateOpenTicketCount();
  navigateTo('dashboard');
}

function generateDemoData() {
  const sampleTitles = [
    ['Laptop tidak bisa connect WiFi', 'Network', 'High'],
    ['Lupa password email', 'Access', 'Medium'],
    ['Printer lantai 3 macet', 'Hardware', 'Low'],
    ['Software ERP error saat login', 'Software', 'Critical'],
    ['Request akses VPN', 'Access', 'Medium'],
    ['Komputer restart sendiri', 'Hardware', 'High'],
    ['Email tidak bisa kirim attachment', 'Email', 'Medium'],
    ['Monitor kedip-kedip', 'Hardware', 'Low'],
    ['Instalasi Microsoft Office', 'Software', 'Low'],
    ['Jaringan lambat di gedung A', 'Network', 'High'],
    ['Akses folder shared drive ditolak', 'Access', 'Medium'],
    ['Antivirus expired', 'Software', 'High'],
    ['Keyboard rusak', 'Hardware', 'Low'],
    ['Projector meeting room error', 'Hardware', 'Medium'],
    ['Setup laptop baru karyawan', 'Hardware', 'Medium'],
    ['Website internal down', 'Network', 'Critical'],
    ['Email spam masuk terus', 'Email', 'Low'],
    ['Aplikasi crash saat save data', 'Software', 'High'],
    ['Request upgrade RAM', 'Hardware', 'Low'],
    ['VPN disconnect terus-menerus', 'Network', 'High']
  ];

  const names = ['Budi Santoso', 'Siti Rahayu', 'Ahmad Fauzi', 'Dewi Lestari', 'Riko Pratama', 'Maya Indah', 'Hendra Wijaya', 'Putri Ayu', 'Doni Saputra', 'Lina Marlina'];
  const statuses = ['Open', 'In Progress', 'Pending', 'Resolved', 'Closed'];
  const assignees = ['IT Support', 'Budi Tech', 'Admin IT', 'Helpdesk'];

  sampleTitles.forEach(([title, category, priority], idx) => {
    const daysAgo = Math.floor(Math.random() * 30);
    const hoursAgo = Math.floor(Math.random() * 24);
    const created = new Date();
    created.setDate(created.getDate() - daysAgo);
    created.setHours(created.getHours() - hoursAgo);

    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const name = names[Math.floor(Math.random() * names.length)];
    const dept = DEPARTMENTS[Math.floor(Math.random() * DEPARTMENTS.length)];
    const assignee = assignees[Math.floor(Math.random() * assignees.length)];

    const ticket = {
      title,
      description: `User melaporkan masalah: ${title}. Mohon segera ditindaklanjuti.`,
      category,
      priority,
      requester: name,
      department: dept,
      assignee
    };

    const created_ticket = TicketStore.create(ticket);

    // Override created date
    const updates = { createdAt: created.toISOString() };

    if (status !== 'Open') {
      const slaTarget = SLA_TARGETS[priority];

      if (status === 'Resolved' || status === 'Closed') {
        const resolveHours = Math.random() * slaTarget * 1.5;
        const resolvedAt = new Date(created.getTime() + resolveHours * 3600000);
        updates.resolvedAt = resolvedAt.toISOString();
        updates.ttr = Math.round(resolveHours * 100) / 100;
        updates.slaBreached = resolveHours > slaTarget;
        updates.status = status;
        if (status === 'Closed') {
          updates.closedAt = new Date(resolvedAt.getTime() + 3600000).toISOString();
        }
      } else {
        updates.status = status;
        if (status === 'Pending') {
          updates.slaPausedAt = new Date(created.getTime() + Math.random() * 4 * 3600000).toISOString();
        }
      }
    }

    updates.notes = [{
      author: 'System',
      text: 'Tiket dibuat (demo data)',
      timestamp: created.toISOString()
    }];

    TicketStore.update(created_ticket.id, updates);
  });

  showToast('success', `${sampleTitles.length} tiket demo berhasil di-generate!`);
  updateOpenTicketCount();
  navigateTo('dashboard');
}

// ==========================================
// HELPERS
// ==========================================
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateFile(date) {
  return date.toISOString().slice(0, 10);
}

function formatHours(hours) {
  if (hours == null) return '-';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  const days = Math.floor(hours / 24);
  const remaining = Math.round((hours % 24) * 10) / 10;
  return `${days}d ${remaining}h`;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function updateOpenTicketCount() {
  const tickets = TicketStore.getAll();
  const openCount = tickets.filter(t => t.status !== 'Resolved' && t.status !== 'Closed').length;
  const badge = document.getElementById('open-ticket-count');
  badge.textContent = openCount;
  badge.style.display = openCount > 0 ? '' : 'none';
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(type, message) {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.classList.add('toast-removing'); setTimeout(() => this.parentElement.remove(), 300)">✕</button>
  `;
  
  container.appendChild(toast);

  // Auto remove
  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.add('toast-removing');
      setTimeout(() => toast.remove(), 300);
    }
  }, 4000);
}

// ==========================================
// INITIALIZATION
// ==========================================

// ==========================================
// GOOGLE SHEETS LOGGING (Tambahan)
// ==========================================
async function logToGoogleSheet(action, ticketId, ticketData) {
    const dataLog = {
        timestamp: new Date().toLocaleString('id-ID'),
        action: action,
        ticket_id: ticketId,
        title: ticketData.title || '-',
        category: ticketData.category || '-',
        priority: ticketData.priority || '-',
        requester: ticketData.requester || '-',
        department: ticketData.department || '-',
        // Ini kuncinya: mengambil dari description agar tidak kosong
        details: ticketData.description || '-' 
    };

    try {
        await fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataLog)
        });
        console.log("✅ Data tiket lengkap terkirim!");
    } catch (error) {
        console.warn("⚠️ Gagal kirim data:", error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
  updateOpenTicketCount();
  refreshDashboard();

  // Close modal on overlay click
  document.getElementById('ticket-modal').addEventListener('click', (e) => {
    if (e.target.id === 'ticket-modal') closeTicketModal();
  });

  // Close notification dropdown on outside click
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notification-dropdown');
    const btn = document.getElementById('notification-btn');
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });

  // Periodically update SLA statuses
  setInterval(() => {
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.id === 'page-dashboard') {
      refreshDashboard();
    }
  }, 60000); // Every minute
});