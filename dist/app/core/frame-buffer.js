// Keep the last complete frame visible until the latest requested frame is ready.
export class FrameBuffer {
  constructor({ load, commit, onError = () => {} }) {
    Object.assign(this, { load, commit, onError });
    this.sequence = 0;
    this.desiredKey = null;
    this.visibleKey = null;
    this.failed = new Set();
    this.disposed = false;
  }
  present(key, value) {
    if (this.disposed || this.desiredKey === key || this.failed.has(key))
      return;
    this.desiredKey = key;
    const sequence = ++this.sequence;
    if (this.visibleKey === key) return;
    Promise.resolve()
      .then(() => this.load(value))
      .then((ready) => {
        if (this.disposed || sequence !== this.sequence) return;
        this.commit(ready, value);
        this.visibleKey = key;
      })
      .catch((error) => {
        if (this.disposed || sequence !== this.sequence) return;
        this.failed.add(key);
        this.onError(error);
      });
  }
  dispose() {
    this.disposed = true;
    this.sequence++;
  }
}
