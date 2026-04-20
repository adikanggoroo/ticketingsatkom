/* ============================================
   IT Ticketing System — Dashboard & Charts
   ============================================ */

// Chart instances cache
let chartInstances = {};

// ==========================================
// REFRESH DASHBOARD
// ==========================================
function refreshDashboard() {
  const tickets = TicketStore.getAll();
  renderKPICards(tickets);
  renderRecentTickets(tickets);
  renderStatusChart(tickets);
  renderPriorityChart(tickets);
  renderSLAChart(tickets);
  renderCategoryChart(tickets);
}

// ==========================================
// KPI CARDS
// ==========================================
function renderKPICards(tickets) {
  const total = tickets.length;
  const open = tickets.filter(t => t.status === 'Open' || t.status === 'In Progress' || t.status === 'Pending').length;
  const resolved = tickets.filter(t => t.status === 'Resolved' || t.status === 'Closed').length;
  const avgTTR = TTRCalculator.getAverageTTR(tickets);
  
  const resolvedWithSLA = tickets.filter(t => (t.status === 'Resolved' || t.status === 'Closed') && t.ttr != null);
  const slaCompliant = resolvedWithSLA.filter(t => !t.slaBreached).length;
  const slaRate = resolvedWithSLA.length > 0 ? Math.round((slaCompliant / resolvedWithSLA.length) * 100) : 100;

  const breached = tickets.filter(t => t.slaBreached || SLAEngine.getStatus(t) === 'breached').length;

  const grid = document.getElementById('kpi-grid');
  grid.innerHTML = `
    <div class="kpi-card primary">
      <div class="kpi-card-header">
        <div class="kpi-card-icon">📋</div>
      </div>
      <div class="kpi-card-value">${total}</div>
      <div class="kpi-card-label">Total Tiket</div>
    </div>
    <div class="kpi-card warning">
      <div class="kpi-card-header">
        <div class="kpi-card-icon">📂</div>
      </div>
      <div class="kpi-card-value">${open}</div>
      <div class="kpi-card-label">Tiket Aktif</div>
    </div>
    <div class="kpi-card success">
      <div class="kpi-card-header">
        <div class="kpi-card-icon">✅</div>
      </div>
      <div class="kpi-card-value">${resolved}</div>
      <div class="kpi-card-label">Selesai</div>
    </div>
    <div class="kpi-card info">
      <div class="kpi-card-header">
        <div class="kpi-card-icon">⏱️</div>
      </div>
      <div class="kpi-card-value">${formatHours(avgTTR)}</div>
      <div class="kpi-card-label">Rata-rata TTR</div>
    </div>
    <div class="kpi-card ${slaRate >= 90 ? 'success' : slaRate >= 70 ? 'warning' : 'danger'}">
      <div class="kpi-card-header">
        <div class="kpi-card-icon">📊</div>
      </div>
      <div class="kpi-card-value">${slaRate}%</div>
      <div class="kpi-card-label">SLA Compliance</div>
    </div>
    <div class="kpi-card danger">
      <div class="kpi-card-header">
        <div class="kpi-card-icon">⚠️</div>
      </div>
      <div class="kpi-card-value">${breached}</div>
      <div class="kpi-card-label">SLA Breach</div>
    </div>
  `;
}

// ==========================================
// RECENT TICKETS TABLE
// ==========================================
function renderRecentTickets(tickets) {
  const recent = tickets.slice(0, 5);
  const tbody = document.getElementById('recent-tickets-body');

  if (recent.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state" style="padding: 30px;">
            <div class="empty-state-icon">📭</div>
            <h3>Belum ada tiket</h3>
            <p>Buat tiket pertama Anda untuk memulai</p>
            <button class="btn btn-primary btn-sm" onclick="navigateTo('create-ticket')">➕ Buat Tiket</button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = recent.map(t => {
    const slaStatus = SLAEngine.getStatus(t);
    const statusClass = t.status.toLowerCase().replace(' ', '-');
    const slaLabel = slaStatus === 'breached' ? 'Breach' : slaStatus === 'at-risk' ? 'At Risk' : 'On Track';
    
    return `
      <tr onclick="openTicketModal('${t.id}')" style="cursor:pointer">
        <td class="ticket-id-cell">${t.id}</td>
        <td class="ticket-title-cell" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</td>
        <td><span class="priority-badge ${t.priority.toLowerCase()}">${t.priority}</span></td>
        <td><span class="status-badge ${statusClass}">${t.status}</span></td>
        <td><span class="sla-badge ${slaStatus}">${slaLabel}</span></td>
        <td style="color: var(--text-muted); font-size: 12px;">${formatDate(t.createdAt)}</td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// CHARTS
// ==========================================
const CHART_COLORS = {
  primary: '#6366f1',
  primaryLight: '#818cf8',
  success: '#10b981',
  successLight: '#34d399',
  warning: '#f59e0b',
  warningLight: '#fbbf24',
  danger: '#ef4444',
  dangerLight: '#f87171',
  info: '#3b82f6',
  infoLight: '#60a5fa',
  purple: '#8b5cf6',
  purpleLight: '#a78bfa',
  gray: '#64748b',
  grayLight: '#94a3b8'
};

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: '#94a3b8',
        font: { family: 'Inter', size: 12 },
        padding: 16,
        usePointStyle: true,
        pointStyleWidth: 10
      }
    }
  },
  scales: {}
};

function createOrUpdateChart(canvasId, config) {
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  chartInstances[canvasId] = new Chart(ctx, config);
}

function renderStatusChart(tickets) {
  const statusCounts = {};
  STATUSES.forEach(s => statusCounts[s] = 0);
  tickets.forEach(t => { if (statusCounts[t.status] !== undefined) statusCounts[t.status]++; });

  createOrUpdateChart('chart-status', {
    type: 'doughnut',
    data: {
      labels: STATUSES,
      datasets: [{
        data: STATUSES.map(s => statusCounts[s]),
        backgroundColor: [
          CHART_COLORS.info,
          CHART_COLORS.warning,
          CHART_COLORS.purple,
          CHART_COLORS.success,
          CHART_COLORS.gray
        ],
        borderWidth: 0,
        hoverOffset: 8
      }]
    },
    options: {
      ...chartDefaults,
      cutout: '65%',
      plugins: {
        ...chartDefaults.plugins,
        legend: {
          ...chartDefaults.plugins.legend,
          position: 'bottom'
        }
      }
    }
  });
}

function renderPriorityChart(tickets) {
  const priorityCounts = {};
  PRIORITIES.forEach(p => priorityCounts[p] = 0);
  tickets.forEach(t => { if (priorityCounts[t.priority] !== undefined) priorityCounts[t.priority]++; });

  createOrUpdateChart('chart-priority', {
    type: 'bar',
    data: {
      labels: PRIORITIES,
      datasets: [{
        label: 'Jumlah Tiket',
        data: PRIORITIES.map(p => priorityCounts[p]),
        backgroundColor: [
          CHART_COLORS.danger,
          'rgba(249, 115, 22, 0.8)',
          CHART_COLORS.warning,
          CHART_COLORS.success
        ],
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 50
      }]
    },
    options: {
      ...chartDefaults,
      plugins: {
        ...chartDefaults.plugins,
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { family: 'Inter', size: 12 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(99, 102, 241, 0.06)' },
          ticks: { 
            color: '#64748b', 
            font: { family: 'Inter', size: 11 },
            stepSize: 1
          }
        }
      }
    }
  });
}

function renderSLAChart(tickets) {
  const slaData = {};
  PRIORITIES.forEach(p => {
    const pTickets = tickets.filter(t => t.priority === p && (t.status === 'Resolved' || t.status === 'Closed') && t.ttr != null);
    const compliant = pTickets.filter(t => !t.slaBreached).length;
    slaData[p] = pTickets.length > 0 ? Math.round((compliant / pTickets.length) * 100) : 100;
  });

  createOrUpdateChart('chart-sla', {
    type: 'bar',
    data: {
      labels: PRIORITIES,
      datasets: [{
        label: 'SLA Compliance %',
        data: PRIORITIES.map(p => slaData[p]),
        backgroundColor: PRIORITIES.map(p => {
          const val = slaData[p];
          if (val >= 90) return CHART_COLORS.success;
          if (val >= 70) return CHART_COLORS.warning;
          return CHART_COLORS.danger;
        }),
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 50
      }]
    },
    options: {
      ...chartDefaults,
      indexAxis: 'y',
      plugins: {
        ...chartDefaults.plugins,
        legend: { display: false }
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          grid: { color: 'rgba(99, 102, 241, 0.06)' },
          ticks: {
            color: '#64748b',
            font: { family: 'Inter', size: 11 },
            callback: v => v + '%'
          }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { family: 'Inter', size: 12 } }
        }
      }
    }
  });
}

function renderCategoryChart(tickets) {
  const categoryCounts = {};
  CATEGORIES.forEach(c => categoryCounts[c] = 0);
  tickets.forEach(t => { if (categoryCounts[t.category] !== undefined) categoryCounts[t.category]++; });

  const sorted = CATEGORIES.slice().sort((a, b) => categoryCounts[b] - categoryCounts[a]);
  const colors = [
    CHART_COLORS.primary,
    CHART_COLORS.info,
    CHART_COLORS.success,
    CHART_COLORS.warning,
    CHART_COLORS.purple,
    CHART_COLORS.danger
  ];

  createOrUpdateChart('chart-category', {
    type: 'bar',
    data: {
      labels: sorted,
      datasets: [{
        label: 'Tiket',
        data: sorted.map(c => categoryCounts[c]),
        backgroundColor: colors,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 40
      }]
    },
    options: {
      ...chartDefaults,
      indexAxis: 'y',
      plugins: {
        ...chartDefaults.plugins,
        legend: { display: false }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: 'rgba(99, 102, 241, 0.06)' },
          ticks: { color: '#64748b', font: { family: 'Inter', size: 11 }, stepSize: 1 }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { family: 'Inter', size: 12 } }
        }
      }
    }
  });
}

// ==========================================
// REPORTS PAGE
// ==========================================
function refreshReports() {
  const tickets = TicketStore.getAll();
  renderReportKPIs(tickets);
  renderTrendChart(tickets);
  renderTTRCategoryChart(tickets);
  renderDepartmentChart(tickets);
  renderSLADetailTable(tickets);
}

function renderReportKPIs(tickets) {
  const total = tickets.length;
  const resolved = tickets.filter(t => t.status === 'Resolved' || t.status === 'Closed').length;
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
  
  const avgTTR = TTRCalculator.getAverageTTR(tickets);
  
  const resolvedWithSLA = tickets.filter(t => (t.status === 'Resolved' || t.status === 'Closed') && t.ttr != null);
  const slaCompliant = resolvedWithSLA.filter(t => !t.slaBreached).length;
  const slaRate = resolvedWithSLA.length > 0 ? Math.round((slaCompliant / resolvedWithSLA.length) * 100) : 100;

  // This month stats
  const now = new Date();
  const thisMonth = tickets.filter(t => {
    const d = new Date(t.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const grid = document.getElementById('report-kpi-grid');
  grid.innerHTML = `
    <div class="kpi-card primary">
      <div class="kpi-card-header">
        <div class="kpi-card-icon">📊</div>
      </div>
      <div class="kpi-card-value">${resolutionRate}%</div>
      <div class="kpi-card-label">Resolution Rate</div>
    </div>
    <div class="kpi-card info">
      <div class="kpi-card-header">
        <div class="kpi-card-icon">⏱️</div>
      </div>
      <div class="kpi-card-value">${formatHours(avgTTR)}</div>
      <div class="kpi-card-label">Rata-rata TTR</div>
    </div>
    <div class="kpi-card ${slaRate >= 90 ? 'success' : slaRate >= 70 ? 'warning' : 'danger'}">
      <div class="kpi-card-header">
        <div class="kpi-card-icon">📈</div>
      </div>
      <div class="kpi-card-value">${slaRate}%</div>
      <div class="kpi-card-label">SLA Compliance</div>
    </div>
    <div class="kpi-card warning">
      <div class="kpi-card-header">
        <div class="kpi-card-icon">📅</div>
      </div>
      <div class="kpi-card-value">${thisMonth.length}</div>
      <div class="kpi-card-label">Tiket Bulan Ini</div>
    </div>
  `;
}

function renderTrendChart(tickets) {
  // Last 30 days
  const days = [];
  const counts = [];
  const now = new Date();

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    days.push(d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }));
    counts.push(tickets.filter(t => t.createdAt && t.createdAt.slice(0, 10) === dateStr).length);
  }

  createOrUpdateChart('chart-trend', {
    type: 'line',
    data: {
      labels: days,
      datasets: [{
        label: 'Tiket Masuk',
        data: counts,
        borderColor: CHART_COLORS.primary,
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: CHART_COLORS.primary,
        pointBorderColor: CHART_COLORS.primary,
        pointRadius: 3,
        pointHoverRadius: 6
      }]
    },
    options: {
      ...chartDefaults,
      plugins: {
        ...chartDefaults.plugins,
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#64748b',
            font: { family: 'Inter', size: 10 },
            maxRotation: 45,
            maxTicksLimit: 15
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(99, 102, 241, 0.06)' },
          ticks: { color: '#64748b', font: { family: 'Inter', size: 11 }, stepSize: 1 }
        }
      }
    }
  });
}

function renderTTRCategoryChart(tickets) {
  const ttrByCategory = TTRCalculator.getAverageTTRByCategory(tickets);
  const cats = CATEGORIES.filter(c => ttrByCategory[c] > 0);
  
  if (cats.length === 0) {
    // Show empty chart
    const ctx = document.getElementById('chart-ttr-category');
    if (chartInstances['chart-ttr-category']) chartInstances['chart-ttr-category'].destroy();
    return;
  }

  createOrUpdateChart('chart-ttr-category', {
    type: 'bar',
    data: {
      labels: cats,
      datasets: [{
        label: 'Avg TTR (jam)',
        data: cats.map(c => ttrByCategory[c]),
        backgroundColor: [
          CHART_COLORS.primary,
          CHART_COLORS.info,
          CHART_COLORS.success,
          CHART_COLORS.warning,
          CHART_COLORS.purple,
          CHART_COLORS.danger
        ],
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 40
      }]
    },
    options: {
      ...chartDefaults,
      plugins: {
        ...chartDefaults.plugins,
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(99, 102, 241, 0.06)' },
          ticks: {
            color: '#64748b',
            font: { family: 'Inter', size: 11 },
            callback: v => v + 'h'
          }
        }
      }
    }
  });
}

function renderDepartmentChart(tickets) {
  const deptCounts = {};
  DEPARTMENTS.forEach(d => deptCounts[d] = 0);
  tickets.forEach(t => { if (deptCounts[t.department] !== undefined) deptCounts[t.department]++; });

  const sorted = DEPARTMENTS.slice().sort((a, b) => deptCounts[b] - deptCounts[a]).filter(d => deptCounts[d] > 0);

  if (sorted.length === 0) return;

  const colors = [
    CHART_COLORS.primary,
    CHART_COLORS.info,
    CHART_COLORS.success,
    CHART_COLORS.warning,
    CHART_COLORS.purple,
    CHART_COLORS.danger,
    CHART_COLORS.gray
  ];

  createOrUpdateChart('chart-department', {
    type: 'doughnut',
    data: {
      labels: sorted,
      datasets: [{
        data: sorted.map(d => deptCounts[d]),
        backgroundColor: colors.slice(0, sorted.length),
        borderWidth: 0,
        hoverOffset: 8
      }]
    },
    options: {
      ...chartDefaults,
      cutout: '55%',
      plugins: {
        ...chartDefaults.plugins,
        legend: {
          ...chartDefaults.plugins.legend,
          position: 'bottom'
        }
      }
    }
  });
}

function renderSLADetailTable(tickets) {
  const tbody = document.getElementById('sla-detail-body');
  const ttrByPriority = TTRCalculator.getAverageTTRByPriority(tickets);

  tbody.innerHTML = PRIORITIES.map(p => {
    const pTickets = tickets.filter(t => t.priority === p);
    const resolved = pTickets.filter(t => (t.status === 'Resolved' || t.status === 'Closed') && t.ttr != null);
    const compliant = resolved.filter(t => !t.slaBreached).length;
    const breached = resolved.length - compliant;
    const rate = resolved.length > 0 ? Math.round((compliant / resolved.length) * 100) : 100;
    const rateClass = rate >= 90 ? 'on-track' : rate >= 70 ? 'at-risk' : 'breached';

    return `
      <tr>
        <td><span class="priority-badge ${p.toLowerCase()}">${p}</span></td>
        <td>${SLA_TARGETS[p]} jam</td>
        <td>${pTickets.length}</td>
        <td style="color: var(--color-success)">${compliant}</td>
        <td style="color: var(--color-danger)">${breached}</td>
        <td><span class="sla-badge ${rateClass}">${rate}%</span></td>
        <td>${ttrByPriority[p] > 0 ? formatHours(ttrByPriority[p]) : '-'}</td>
      </tr>
    `;
  }).join('');
}
