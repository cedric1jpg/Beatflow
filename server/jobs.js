const jobs = new Map();

class JobChannel {
  constructor(jobId) {
    this.jobId = jobId;
    this.listeners = new Set();
    this.state = { jobId, status: 'pending', progress: 0 };
  }

  publish(event, data = {}) {
    const payload = { event, data: { jobId: this.jobId, ...data } };
    if (event === 'progress') {
      this.state.progress = data.progress ?? this.state.progress;
      this.state.status = data.status || this.state.status;
    }
    if (event === 'complete') {
      this.state = { ...this.state, ...data, status: 'complete', progress: 100 };
    }
    if (event === 'error') {
      this.state.status = 'error';
      this.state.error = data.error;
    }
    for (const listener of this.listeners) {
      listener(payload);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener({ event: 'snapshot', data: this.state });
    return () => this.listeners.delete(listener);
  }
}

export function createJobHub() {
  return {
    create(jobId) {
      const channel = new JobChannel(jobId);
      jobs.set(jobId, channel);
      return channel;
    },
    get(jobId) {
      return jobs.get(jobId);
    },
    delete(jobId) {
      jobs.delete(jobId);
    }
  };
}
