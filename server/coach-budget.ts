// Aborting the entire provider also stops CLI/MCP work when a tool budget is hit.
export class CoachBudget {
  private controller = new AbortController();
  readonly signal = this.controller.signal;
  reason?: string;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(timeout: number) {
    if (timeout <= 0) return;
    this.timer = setTimeout(() => {
      this.reason ??= '已达到最长用时，分析已超时';
      this.controller.abort(new Error(this.reason));
    }, timeout);
  }
  hit(reason: string): never {
    this.reason ??= reason;
    this.controller.abort(new Error(this.reason));
    throw new Error(this.reason);
  }
  close() {
    clearTimeout(this.timer);
  }
}
