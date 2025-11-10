import db from "./db.js";
import { nowISO } from "./utils.js";

export function enqueue(job) {
  const stmt =
    db.prepare(`INSERT INTO jobs (id, command, state, attempts, max_retries, created_at, updated_at, run_after)
    VALUES (@id, @command, @state, @attempts, @max_retries, @created_at, @updated_at, @run_after)`);
  const j = {
    id: job.id,
    command: job.command,
    state: job.state || "pending",
    attempts: job.attempts ?? 0,
    max_retries: job.max_retries ?? 3,
    created_at: job.created_at || nowISO(),
    updated_at: job.updated_at || nowISO(),
    run_after: job.run_after || null,
  };
  stmt.run(j);
  return j;
}

// atomically claim a job that's pending and past run_after
export function claimJob(workerId) {
  // Use a transaction to find and lock one job
  const tx = db.transaction(() => {
    const now = nowISO();
    const row = db
      .prepare(
        `
      SELECT * FROM jobs
      WHERE state = 'pending'
        AND (run_after IS NULL OR run_after <= ?)
      ORDER BY created_at ASC
      LIMIT 1
    `
      )
      .get(now);

    if (!row) return null;

    db.prepare(
      `
      UPDATE jobs SET state='processing', locked_by=?, locked_at=?, updated_at=?
      WHERE id=? AND state='pending'
    `
    ).run(workerId, now, now, row.id);

    const locked = db.prepare("SELECT * FROM jobs WHERE id = ?").get(row.id);
    return locked;
  });
  return tx();
}

export function completeJob(id, output = "") {
  const now = nowISO();
  db.prepare(
    `
    UPDATE jobs SET state='completed', updated_at=?, output=?, locked_by=NULL, locked_at=NULL
    WHERE id=?
  `
  ).run(now, output, id);
}

export function failAndMaybeRetry(id, lastError, backoffSeconds, maxRetries) {
  const now = nowISO();
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
  if (!job) return;

  const attempts = job.attempts + 1;
  if (attempts > job.max_retries || attempts > maxRetries) {
    // move to dlq
    db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
    db.prepare(
      `
      INSERT OR REPLACE INTO dlq (id, command, attempts, max_retries, failed_at, last_error, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      job.id,
      job.command,
      attempts,
      job.max_retries,
      now,
      String(lastError).slice(0, 1000),
      job.created_at
    );
    return { movedToDLQ: true };
  } else {
    // schedule for later using run_after = now + backoffSeconds
    const runAfter = new Date(Date.now() + backoffSeconds * 1000).toISOString();
    db.prepare(
      `
      UPDATE jobs SET attempts=?, state='pending', run_after=?, locked_by=NULL, locked_at=NULL, updated_at=?
      WHERE id=?
    `
    ).run(attempts, runAfter, now, id);
    return { retried: true, nextRun: runAfter };
  }
}

export function listJobs(state = null) {
  if (!state)
    return db.prepare("SELECT * FROM jobs ORDER BY created_at DESC").all();
  return db
    .prepare("SELECT * FROM jobs WHERE state = ? ORDER BY created_at DESC")
    .all(state);
}

export function listDLQ() {
  return db.prepare("SELECT * FROM dlq ORDER BY failed_at DESC").all();
}

export function retryDLQ(id) {
  const row = db.prepare("SELECT * FROM dlq WHERE id = ?").get(id);
  if (!row) throw new Error("DLQ job not found");
  // reinsert into jobs with attempts already (so it will be retried)
  db.prepare(
    `
    INSERT OR REPLACE INTO jobs (id, command, state, attempts, max_retries, created_at, updated_at)
    VALUES (?, ?, 'pending', ?, ?, ?, ?)
  `
  ).run(
    row.id,
    row.command,
    row.attempts,
    row.max_retries,
    row.created_at,
    nowISO()
  );

  db.prepare("DELETE FROM dlq WHERE id = ?").run(id);
}

export function jobStats() {
  const rows = db
    .prepare(
      `
    SELECT state, COUNT(*) as count FROM jobs GROUP BY state
  `
    )
    .all();
  const stats = { pending: 0, processing: 0, completed: 0, failed: 0, dead: 0 };
  for (const r of rows) stats[r.state] = r.count;
  const activeWorkers = db
    .prepare("SELECT value FROM config WHERE key = 'active_workers'")
    .get();
  return { stats, activeWorkers: activeWorkers ? activeWorkers.value : "0" };
}
