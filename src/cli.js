#!/usr/bin/env node
import { Command } from "commander";
import { genId } from "./utils.js";
import * as queue from "./queue.js";
import { Worker } from "./worker.js";
import { getConfig, setConfig, allConfig } from "./config.js";
import db from "./db.js";

const program = new Command();
program
  .name("queuectl")
  .description("CLI background job queue")
  .version("1.0.0");

// Keep track of worker instances in this process
const workers = new Map();

/* ----------------------------- ENQUEUE COMMAND ----------------------------- */
program
  .command("enqueue <jobJson>")
  .description("enqueue a job (pass JSON or a simple command string)")
  .action((jobJson) => {
    let jobObj;
    try {
      if (!jobJson.trim().startsWith("{")) {
        // If raw string, wrap into JSON
        jobObj = { id: genId("job"), command: jobJson };
      } else {
        jobObj = JSON.parse(jobJson);
        if (!jobObj.id) jobObj.id = genId("job");
        if (!jobObj.command) throw new Error("Job must contain 'command'");
      }
    } catch (err) {
      console.error("Invalid JSON or command:", err.message);
      process.exit(1);
    }

    const inserted = queue.enqueue(jobObj);
    console.log("✅ Enqueued:", inserted.id);
  });

/* ----------------------------- WORKER COMMANDS ----------------------------- */
const workerCmd = program.command("worker").description("manage workers");

workerCmd
  .command("start")
  .option("--count <n>", "number of workers to start", "1")
  .description("start one or more workers in this process")
  .action((opts) => {
    const count = Number(opts.count);
    if (isNaN(count) || count <= 0) {
      console.error("❌ Invalid worker count");
      process.exit(1);
    }

    for (let i = 0; i < count; i++) {
      const id = `w-${Date.now()}-${i}`;
      const w = new Worker(id);
      workers.set(id, w);
      w.start().catch((err) => console.error("Worker error:", err));
    }

    console.log(`🚀 Started ${count} worker(s)`);

    // Graceful shutdown
    const stopAll = () => {
      console.log("\n🛑 Stopping all workers...");
      for (const w of workers.values()) w.stop();
      process.exit(0);
    };

    process.on("SIGINT", stopAll);
    process.on("SIGTERM", stopAll);
  });

workerCmd
  .command("stop")
  .description("stop all workers in this process")
  .action(() => {
    for (const w of workers.values()) w.stop();
    console.log("🛑 Stop signal sent to workers in this process.");
  });

/* ----------------------------- STATUS COMMAND ----------------------------- */
program
  .command("status")
  .description("show summary of all job states & active workers")
  .action(() => {
    const s = queue.jobStats();
    console.log("\n📊 Job counts:", s.stats);
    console.log("⚙️  Active workers (config):", s.activeWorkers);
  });

/* ------------------------------ LIST COMMAND ------------------------------ */
program
  .command("list")
  .option("--state <s>", "state filter (pending|processing|completed)")
  .description("list jobs (optionally filtered by state)")
  .action((opts) => {
    const rows = queue.listJobs(opts.state);
    if (rows.length === 0) {
      console.log("No jobs found.");
      return;
    }
    console.table(
      rows.map((r) => ({
        id: r.id,
        command: r.command,
        state: r.state,
        attempts: r.attempts,
        run_after: r.run_after,
      }))
    );
  });

/* ----------------------------- DLQ COMMANDS ----------------------------- */
const dlqCmd = program
  .command("dlq")
  .description("dead-letter queue management");

dlqCmd
  .command("list")
  .description("list DLQ jobs")
  .action(() => {
    const rows = queue.listDLQ();
    if (rows.length === 0) {
      console.log("✅ DLQ is empty");
      return;
    }
    console.table(rows);
  });

dlqCmd
  .command("retry <jobId>")
  .description("retry a job from DLQ")
  .action((jobId) => {
    try {
      queue.retryDLQ(jobId);
      console.log("🔁 DLQ job requeued:", jobId);
    } catch (err) {
      console.error("Error retrying DLQ job:", err.message);
    }
  });

/* ---------------------------- CONFIG COMMANDS ---------------------------- */
const configCmd = program.command("config").description("manage configuration");

configCmd
  .command("set <key> <value>")
  .description("set a config value (e.g., backoff_base, max_retries)")
  .action((key, value) => {
    setConfig(key, value);
    console.log(`⚙️  Set ${key} = ${value}`);
  });

configCmd
  .command("get <key>")
  .description("get a config value")
  .action((key) => {
    console.log(`${key}:`, getConfig(key));
  });

configCmd
  .command("list")
  .description("list all config values")
  .action(() => {
    console.table(allConfig());
  });

/* ------------------------------ DEMO COMMAND ------------------------------ */
program
  .command("demo")
  .description("run a demo with one successful and one failing job")
  .action(async () => {
    const successJob = {
      id: genId("job"),
      command: "echo 'Hello from job!';",
      max_retries: 2,
    };
    const failJob = {
      id: genId("job"),
      command: "nonexistent_command_abc_xyz",
      max_retries: 2,
    };

    queue.enqueue(successJob);
    queue.enqueue(failJob);
    console.log("📦 Enqueued demo jobs:", successJob.id, failJob.id);

    const w1 = new Worker("demo-1");
    const w2 = new Worker("demo-2");
    workers.set(w1.id, w1);
    workers.set(w2.id, w2);
    w1.start();
    w2.start();

    console.log("🚀 Started 2 demo workers. Press Ctrl+C to stop.");
  });

/* ----------------------------- DEFAULT HELP ----------------------------- */
program.parse(process.argv);
if (!process.argv.slice(2).length) program.outputHelp();
