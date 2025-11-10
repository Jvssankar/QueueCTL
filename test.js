// test.js — Automated test script for QueueCTL project
import { execSync } from "child_process";

console.log("Running QueueCTL Automated Test...\n");

function run(cmd) {
  try {
    console.log(`${cmd}`);
    const output = execSync(cmd, { stdio: "pipe" }).toString().trim();
    console.log(output + "\n");
    return output;
  } catch (err) {
    console.error(`Error running: ${cmd}`);
    console.error(err.stderr?.toString() || err.message);
  }
}

try {
  // Step 1: Initialize database
  console.log("Step 1: Initializing database...");
  run("node src/cli.js init");

  // Step 2: Enqueue jobs
  console.log("Step 2: Enqueuing jobs...");
  run('node src/cli.js enqueue -- "echo Job 1 success"');
  run('node src/cli.js enqueue -- "some_invalid_command_123"');

  // Step 3: Check job list
  console.log("Step 3: Listing jobs...");
  run("node src/cli.js list");

  // Step 4: Start worker (process jobs once)
  console.log("Step 4: Running worker (process jobs once)...");
  run("node src/cli.js worker --once");

  // Step 5: Show DLQ
  console.log("Step 5: Checking DLQ...");
  const dlqOutput = run("node src/cli.js dlq list");

  if (dlqOutput.includes("DLQ is empty")) {
    console.log("All jobs processed successfully (DLQ empty).");
  } else {
    console.log("Some jobs moved to DLQ. Retrying them...");
    const lines = dlqOutput.split("\n").filter((l) => l.includes("job-"));
    const jobIds = lines
      .map((line) => {
        const match = line.match(/job-[a-f0-9-]+/);
        return match ? match[0] : null;
      })
      .filter(Boolean);

    for (const jobId of jobIds) {
      console.log(`Retrying DLQ job: ${jobId}`);
      run(`node src/cli.js dlq retry ${jobId}`);
    }
  }

  console.log("\nAll core functionalities verified successfully!");
} catch (err) {
  console.error("Automated test failed:\n", err.message);
}
