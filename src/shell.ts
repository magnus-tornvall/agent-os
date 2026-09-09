import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Agent logs and `git diff` output both fit inside this; the default 1MB does not. */
const MAX_BUFFER = 64 * 1024 * 1024;

export async function sh(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, { cwd, maxBuffer: MAX_BUFFER });
  return stdout.trim();
}

/** For existence probes, where a non-zero exit is the answer rather than a failure. */
export async function succeeds(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<boolean> {
  return sh(cmd, args, cwd).then(
    () => true,
    () => false,
  );
}
