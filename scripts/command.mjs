import { spawn } from "node:child_process";
import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function command(name, args, { cwd, inherit = false, allowFailure = false } = {}) {
  // Files keep build/registry output bounded by disk rather than a pipe buffer.
  const temp = inherit ? undefined : await mkdtemp(join(tmpdir(), "ra-steward-command-"));
  const handles = temp ? await Promise.all([open(join(temp, "stdout"), "w"), open(join(temp, "stderr"), "w")]) : [];
  try {
    const child = spawn(name, args, { cwd, stdio: inherit ? "inherit" : ["ignore", handles[0].fd, handles[1].fd] });
    const status = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    const [stdout, stderr] = temp ? await Promise.all([readFile(join(temp, "stdout"), "utf8"), readFile(join(temp, "stderr"), "utf8")]) : ["", ""];
    if (status !== 0 && !allowFailure) throw new Error(`${name} ${args.join(" ")} failed (${status})\n${stdout}\n${stderr}`);
    return { status, stdout, stderr };
  } finally {
    await Promise.all(handles.map((handle) => handle.close()));
    if (temp) await rm(temp, { recursive: true, force: true });
  }
}
