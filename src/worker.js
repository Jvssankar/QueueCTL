import { spawn, exec } from "child_process";
import { sleep, nowISO } from "./utils.js";
import * as queue from "./queue.js";
import { getConfig } from "./config.js";
import { fileURLToPath } from "url";
import { dirname } from "path";
import db from "./db.js";

function getNumber(key, fallback) {
  const v = getConfig(key);
  return v ? Number(v) : fallback;
}

export class Worker {
  constructor(id, loopInterval = 1000) {
    this.id = id;
    this.loopInterval = loopInterval;
    this.running = false;
    this.currentJob = null;
    this._shouldStop = false;
  }

  async start() {
    this.running = true;
    console.log(`[worker ${this.id}] starting`);
    while (!this._shouldStop) {
      try {
        const job = queue.claimJob(this.id);
        if (!job) {
          await sleep(this.loopInterval);
          continue;
        }
        this.currentJob = job;
        console.log(
          `[worker ${this.id}] claimed job ${job.id} -> ${job.command}`
        );
        await this._execute(job);
        this.currentJob = null;
      } catch (err) {
        console.error(`[worker ${this.id}] loop error`, err);
        await sleep(this.loopInterval);
      }
    }
    // wait for current job to finish (if any)
    while (this.currentJob) {
      console.log(
        `[worker ${this.id}] waiting for current job ${this.currentJob.id} to finish before shutdown`
      );
      await sleep(500);
    }
    this.running = false;
    console.log(`[worker ${this.id}] stopped`);
  }

  stop() {
    console.log(`[worker ${this.id}] received stop signal`);
    this._shouldStop = true;
  }

  _execCommand(command, timeoutMs = 0) {
    return new Promise((resolve) => {
      // execute via shell
      const child = exec(
        command,
        { timeout: timeoutMs },
        (error, stdout, stderr) => {
          if (error) {
            resolve({
              success: false,
              code: error.code ?? 1,
              stdout,
              stderr,
              error,
            });
          } else {
            resolve({ success: true, code: 0, stdout, stderr });
          }
        }
      );
    });
  }

  async _execute(job) {
    const base = Number(getConfig("backoff_base") || 2);
    const baseDelay = Number(getConfig("base_delay_seconds") || 1);
    const maxRetriesCfg = Number(getConfig("max_retries") || 3);

    try {
      const res = await this._execCommand(job.command);
      if (res.success) {
        queue.completeJob(job.id, (res.stdout || "") + (res.stderr || ""));
        console.log(`[worker ${this.id}] job ${job.id} completed`);
      } else {
        const attempts = job.attempts ?? 0;
        const backoffSeconds = Math.pow(base, attempts) * baseDelay;
        const result = queue.failAndMaybeRetry(
          job.id,
          res.error?.message || res.stderr || "failed",
          backoffSeconds,
          maxRetriesCfg
        );
        if (result && result.movedToDLQ) {
          console.log(
            `[worker ${this.id}] job ${job.id} moved to DLQ after attempts ${
              attempts + 1
            }`
          );
        } else {
          console.log(
            `[worker ${this.id}] job ${job.id} will be retried at ${result.nextRun}`
          );
        }
      }
    } catch (err) {
      console.error(
        `[worker ${this.id}] execution error for job ${job.id}`,
        err
      );
      const attempts = job.attempts ?? 0;
      const backoffSeconds = Math.pow(base, attempts) * baseDelay;
      queue.failAndMaybeRetry(
        job.id,
        String(err),
        backoffSeconds,
        maxRetriesCfg
      );
    }
  }
}
