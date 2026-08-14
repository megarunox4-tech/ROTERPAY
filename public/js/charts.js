/* ==========================================================================
   ROTER CONTROL HUB - CHARTS & VISUALIZATIONS
   ========================================================================== */

const ChartsManager = {
  overviewChart: null,
  healthChart: null,
  healthHistory: [],

  initOverviewChart(projects) {
    const ctx = document.getElementById('overviewChart');
    if (!ctx) return;

    const labels = projects.map(p => p.name.length > 18 ? p.name.substring(0, 18) + '...' : p.name);
    const dataProgress = projects.map(p => p.progress);

    if (this.overviewChart) {
      this.overviewChart.destroy();
    }

    this.overviewChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Progress (%)',
          data: dataProgress,
          backgroundColor: 'rgba(99, 102, 241, 0.65)',
          borderColor: '#6366f1',
          borderWidth: 2,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#9ca3af', font: { family: 'Inter', size: 11 } }
          },
          y: {
            beginAtZero: true,
            max: 100,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#9ca3af', font: { family: 'Inter', size: 11 } }
          }
        }
      }
    });
  },

  initHealthChart() {
    const ctx = document.getElementById('healthChart');
    if (!ctx) return;

    if (this.healthChart) return;

    this.healthChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['-30s', '-25s', '-20s', '-15s', '-10s', '-5s', 'Now'],
        datasets: [
          {
            label: 'CPU Load (%)',
            data: [20, 25, 22, 30, 28, 32, 25],
            borderColor: '#f43f5e',
            backgroundColor: 'rgba(244, 63, 94, 0.1)',
            tension: 0.4,
            fill: true
          },
          {
            label: 'RAM Heap (MB)',
            data: [15, 16, 18, 17, 19, 18, 20],
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.4,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#9ca3af', font: { family: 'Inter' } }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#9ca3af' }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#9ca3af' }
          }
        }
      }
    });
  },

  pushHealthMetric(cpuVal, ramVal) {
    if (!this.healthChart) return;

    const cpuNumeric = parseInt(cpuVal);
    const datasetCpu = this.healthChart.data.datasets[0].data;
    const datasetRam = this.healthChart.data.datasets[1].data;

    datasetCpu.shift();
    datasetCpu.push(cpuNumeric);

    datasetRam.shift();
    datasetRam.push(ramVal);

    this.healthChart.update();
  }
};
