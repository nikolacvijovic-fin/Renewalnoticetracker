import { randomUUID } from "node:crypto";
import { runPdfWorkerOnce } from "@/lib/background-jobs/pdf-worker";

if (process.argv.includes("--check")) {
  console.log("PDF worker module loaded.");
} else {
  // Each process incarnation owns a unique lease identity, including after crashes.
  const workerId = `pdf-worker:${randomUUID()}`;
  runPdfWorkerOnce(workerId).then((result) => {
    console.log(JSON.stringify(result ?? { status: "idle" }));
  }).catch(() => {
    console.error("PDF worker attempt interrupted; the queue will recover its lease.");
    process.exitCode = 1;
  });
}
