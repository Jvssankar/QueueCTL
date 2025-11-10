# QueueCTL - CLI Background Job Queue

## Overview

**QueueCTL** is a simple CLI-based background job queue system built with **Node.js**. It allows you to:

- Enqueue and manage background jobs.
- Run multiple worker processes to process jobs in parallel.
- Automatically retry failed jobs using **exponential backoff**.
- Maintain a **Dead Letter Queue (DLQ)** for jobs that fail permanently.
- Persist job data across restarts.

This project is designed as a backend developer assignment to demonstrate a minimal production-grade job queue system.

---

## Features

- Enqueue jobs using CLI  
- Persistent storage with SQLite  
- Multiple worker support  
- Automatic retries with **exponential backoff**  
- Dead Letter Queue (DLQ)  
- Configurable parameters: max retries, backoff base, delay  
- Clean CLI interface with help texts  
- Minimal test/demo scripts  

---

## Prerequisites

Make sure you have the following installed:

- **Node.js** >= 18  
- **npm**  
- **Git**  
- VS Code or any code editor  

---

## Setup

1. **Clone the repository:**

```bash
git clone https://github.com/Jvssankar/queuectl.git
cd queuectl
```

2. **Install dependencies:**

```bash
npm install
```

3. **Create data folder for database:**
```bash
mkdir data
```

4. **Start using CLI:**
All availble commands are listed using this only
```bash
node src/cli.js --help
```

## Usage
1. **Enqueue a job:**
```bash
node src/cli.js enqueue "echo 'Hello World'"
```

2. **Start worker/workers:**
```bash
node src/cli.js worker start --count 1 or 2 or more
```

3. **Stop worker/s:**
```bash
Press ctrl+c manually or
node src/cli.js worker stop
```

4. **Check job status:**
```bash
node src/cli.js status
```

5. **List jobs:**
```bash
node src/cli.js list
node src/cli.js list --state pending/processing/completed
```

6. **Dead Letter Queue:**
- Listing of DLQ: 
```bash
node src/cli.js dlq list
```
- Retry of DLQ Job:
```bash
node src/cli.js dlq list
```

7. **Configurations:**
```bash
# Set max retries for all jobs
node src/cli.js config set max_retries 3

# Set backoff base
node src/cli.js config set backoff_base 2

# Set base delay seconds
node src/cli.js config set base_delay_seconds 1

# Get a config value
node src/cli.js config get max_retries

# List all config values
node src/cli.js config list
```

## Testing and Demo

Run the file test.js:
```bash
node test.js
```
or
run the CLI.js demo:
```bash
node src/cli.js demo
```


## Conclusion
QueueCTL is a lightweight and easy-to-use CLI job queue system built in Node.js. It helps you manage background tasks reliably with features like retries, exponential backoff, and a Dead Letter Queue. Even though it’s simple, it demonstrates core concepts used in real-world job queues, making it a great tool for learning or small projects.

With this setup, you can enqueue jobs, run multiple workers safely, monitor job status, handle failures automatically, and configure settings to suit your needs. It’s designed to be straightforward and practical, so you can focus on experimenting with jobs without worrying about complex infrastructure.
