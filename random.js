// random.js
if (Math.random() > 0.5) {
  console.log("Success");
  process.exit(0);
} else {
  console.error("Failing on purpose");
  process.exit(1);
}
