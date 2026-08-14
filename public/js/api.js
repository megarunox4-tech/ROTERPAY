/* ==========================================================================
   ROTER CONTROL HUB - API CLIENT MODULE
   ========================================================================== */

const API = {
  baseUrl: '',

  async request(endpoint, options = {}) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });

      if (!response.ok) {
        throw new Error(`API Error ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Fetch Error [${endpoint}]:`, error);
      throw error;
    }
  },

  // Stats
  getStats() {
    return this.request('/api/stats');
  },

  // Health
  getHealth() {
    return this.request('/api/health');
  },

  // Projects
  getProjects() {
    return this.request('/api/projects');
  },

  createProject(projectData) {
    return this.request('/api/projects', {
      method: 'POST',
      body: JSON.stringify(projectData)
    });
  },

  deleteProject(id) {
    return this.request(`/api/projects/${id}`, {
      method: 'DELETE'
    });
  },

  // Tasks
  getTasks() {
    return this.request('/api/tasks');
  },

  createTask(taskData) {
    return this.request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData)
    });
  },

  updateTask(id, updateData) {
    return this.request(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData)
    });
  },

  deleteTask(id) {
    return this.request(`/api/tasks/${id}`, {
      method: 'DELETE'
    });
  },

  // Activity
  getActivity() {
    return this.request('/api/activity');
  }
};
