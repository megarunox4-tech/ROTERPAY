/* ==========================================================================
   ROTER CONTROL HUB - UI COMPONENTS RENDERER
   ========================================================================== */

const Components = {

  // Toast Notification
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconClass = 'fa-circle-info text-indigo';
    if (type === 'success') iconClass = 'fa-circle-check text-emerald';
    if (type === 'danger') iconClass = 'fa-triangle-exclamation text-rose';

    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  // Format Relative Time
  formatTimeAgo(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  },

  // Render Activity Log Items
  renderActivityList(activities, containerElement) {
    if (!activities || activities.length === 0) {
      containerElement.innerHTML = '<p class="text-muted">No recent activity.</p>';
      return;
    }

    containerElement.innerHTML = `<div class="activity-list">` +
      activities.map(act => `
        <div class="activity-item">
          <div class="activity-bullet"></div>
          <div class="activity-content">
            <p>${act.detail}</p>
            <span>${this.formatTimeAgo(act.timestamp)}</span>
          </div>
        </div>
      `).join('') +
    `</div>`;
  },

  // Render Projects Table
  renderProjectsTable(projects, containerElement, onDeleteCallback) {
    if (!projects || projects.length === 0) {
      containerElement.innerHTML = `<tr><td colspan="7" class="text-muted text-center" style="text-align:center; padding: 2rem;">No projects found.</td></tr>`;
      return;
    }

    containerElement.innerHTML = projects.map(p => {
      let badgeClass = 'badge-in-progress';
      if (p.status === 'Completed') badgeClass = 'badge-completed';
      if (p.status === 'Pending') badgeClass = 'badge-pending';

      return `
        <tr>
          <td><strong>${p.name}</strong></td>
          <td><span class="badge" style="background: rgba(255,255,255,0.06); color: #cbd5e1;">${p.category}</span></td>
          <td><span class="badge ${badgeClass}">${p.status}</span></td>
          <td>
            <div class="progress-bar-container">
              <div class="progress-track">
                <div class="progress-fill" style="width: ${p.progress}%;"></div>
              </div>
              <span style="font-size: 0.78rem;">${p.progress}%</span>
            </div>
          </td>
          <td><i class="fa-solid fa-users text-muted" style="margin-right: 4px;"></i> ${p.team} members</td>
          <td>${p.dueDate}</td>
          <td>
            <button class="btn btn-secondary btn-delete-proj" data-id="${p.id}" title="Delete Project" style="padding: 4px 10px; font-size: 0.75rem;">
              <i class="fa-solid fa-trash-can text-rose"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach Delete Action Listeners
    containerElement.querySelectorAll('.btn-delete-proj').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.getAttribute('data-id'));
        if (confirm('Are you sure you want to delete this project?')) {
          onDeleteCallback(id);
        }
      });
    });
  },

  // Render Kanban Board Column
  renderKanbanColumn(tasks, containerElement, onStatusChangeCallback, onDeleteCallback) {
    if (!tasks || tasks.length === 0) {
      containerElement.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem; font-size: 0.82rem;">No tasks</div>`;
      return;
    }

    containerElement.innerHTML = tasks.map(t => {
      let priorityClass = 'badge-medium';
      if (t.priority === 'High' || t.priority === 'Urgent') priorityClass = 'badge-high';
      if (t.priority === 'Low') priorityClass = 'badge-low';

      return `
        <div class="kanban-card" data-id="${t.id}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div class="kanban-card-title">${t.title}</div>
            <button class="btn-delete-task" data-id="${t.id}" style="background: none; border: none; color: var(--text-muted); cursor: pointer;" title="Delete Task">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div class="kanban-card-project">${t.project}</div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
            <span class="badge ${priorityClass}">${t.priority}</span>
            <select class="select-task-status" data-id="${t.id}" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: var(--text-secondary); font-size: 0.72rem; padding: 2px 6px; border-radius: 4px;">
              <option value="To Do" ${t.status === 'To Do' ? 'selected' : ''}>To Do</option>
              <option value="In Progress" ${t.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
              <option value="Completed" ${t.status === 'Completed' ? 'selected' : ''}>Completed</option>
            </select>
          </div>
          <div class="kanban-card-footer">
            <span><i class="fa-regular fa-user"></i> ${t.assignee}</span>
          </div>
        </div>
      `;
    }).join('');

    // Attach Status Select Listener
    containerElement.querySelectorAll('.select-task-status').forEach(select => {
      select.addEventListener('change', (e) => {
        const id = Number(e.target.getAttribute('data-id'));
        const newStatus = e.target.value;
        onStatusChangeCallback(id, newStatus);
      });
    });

    // Attach Delete Listener
    containerElement.querySelectorAll('.btn-delete-task').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.getAttribute('data-id'));
        onDeleteCallback(id);
      });
    });
  }

};
