/** Draw once per animation frame; encode only after input settles. Stale encodes never publish. */
export class LivePreview<T> {
  private revision = 0;
  private frame: number | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private job: { draw: () => HTMLCanvasElement; publish: (value: T) => void; canvas?: HTMLCanvasElement; encoded?: Promise<T> } | undefined;
  pending = false;

  constructor(private encode: (canvas: HTMLCanvasElement) => Promise<T>, private onError: (error: unknown) => void, private delay = 250) {}

  request(draw: () => HTMLCanvasElement, publish: (value: T) => void) {
    this.cancel();
    const revision = this.revision;
    this.job = { draw, publish }; this.pending = true;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      try { this.draw(); } catch (error) { this.cancel(); this.onError(error); return; }
      this.timer = setTimeout(() => { this.timer = undefined; void this.finish(revision).catch(this.onError); }, this.delay);
    });
  }

  private draw() {
    if (this.job && !this.job.canvas) this.job.canvas = this.job.draw();
    return this.job;
  }

  private async finish(revision: number): Promise<T | undefined> {
    const job = this.draw();
    if (!job?.canvas) return;
    try {
      const value = await (job.encoded ||= this.encode(job.canvas));
      if (revision === this.revision && this.pending) { this.pending = false; job.publish(value); }
      return revision === this.revision ? value : undefined;
    } catch (error) {
      if (revision === this.revision) { this.pending = false; throw error; }
    }
  }

  async flush() {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.frame = undefined; this.timer = undefined;
    return this.finish(this.revision);
  }

  cancel() {
    this.revision++;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.frame = undefined; this.timer = undefined; this.job = undefined; this.pending = false;
  }
}
