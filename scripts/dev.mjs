import { spawn } from "node:child_process";
const children = ["server", "dev"].map((script) =>
  spawn("npm", ["run", script], { stdio: "inherit", env: process.env }),
);
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  children.forEach((child) => child.kill("SIGTERM"));
  process.exitCode = code;
}
children.forEach((child) => child.on("exit", (code) => stop(code ?? 0)));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
