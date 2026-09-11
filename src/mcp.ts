import { spawn } from "node:child_process";

/** An unattended run cannot wait on a server that has stopped answering, and a
 *  work item read that takes this long is not going to arrive. */
const REQUEST_TIMEOUT_MS = 120_000;

/** How long a closing server is given to exit on its own before it is killed. */
const SHUTDOWN_GRACE_MS = 5_000;

/** Enough of the server's stderr to carry an authentication failure into the
 *  error the run reports, and not so much that it buries it. */
const STDERR_TAIL = 4_000;

const PROTOCOL_VERSION = "2025-06-18";

type ToolResult = {
  readonly content?: readonly { readonly type?: string; readonly text?: string }[];
  readonly isError?: boolean;
};

type Envelope = {
  readonly id?: unknown;
  readonly result?: ToolResult;
  readonly error?: { readonly message?: string };
};

/** The one thing agentflow asks of an MCP server: call a tool, read the text it
 *  answered with. Nothing here is specific to Azure DevOps. */
export type McpServer = {
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
  /** The server is a child process holding pipes, so an unclosed one keeps the
   *  run from exiting. Closing a server never started is a no-op. */
  close(): Promise<void>;
};

type Session = {
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
  stop(): Promise<void>;
};

/** Started on the first call rather than here, so a run that never reaches the
 *  provider never pays for its server. */
export function mcpServer(spec: {
  readonly command: string;
  readonly args: readonly string[];
  /** What the run calls this server in its own errors. */
  readonly label: string;
}): McpServer {
  let session: Promise<Session> | undefined;

  return {
    callTool: async (name, args) => {
      session ??= start(spec);
      return (await session).callTool(name, args);
    },

    close: async () => {
      const started = session;
      if (started === undefined) {
        return;
      }
      session = undefined;
      await (await started.catch(() => undefined))?.stop();
    },
  };
}

async function start(spec: {
  readonly command: string;
  readonly args: readonly string[];
  readonly label: string;
}): Promise<Session> {
  const { label } = spec;
  const child = spawn(spec.command, [...spec.args]);

  const pending = new Map<
    number,
    { resolve: (envelope: Envelope) => void; reject: (error: Error) => void }
  >();
  let failure: string | undefined;
  let stderrTail = "";
  let stdout = "";
  let nextId = 1;

  /** Every way the server can stop answering ends here: pending calls are told
   *  why rather than waiting out their timeout, and later calls are refused
   *  without spawning anything. */
  const fail = (reason: string): void => {
    failure ??= reason;
    for (const waiter of pending.values()) {
      waiter.reject(new Error(reason));
    }
    pending.clear();
  };

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL);
  });

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
    for (let end = stdout.indexOf("\n"); end !== -1; end = stdout.indexOf("\n")) {
      const line = stdout.slice(0, end);
      stdout = stdout.slice(end + 1);
      deliver(line);
    }
  });

  /** Framing is one JSON message per line; anything else on stdout is the
   *  server's own noise and is not a message this client lost. */
  const deliver = (line: string): void => {
    if (line.trim() === "") {
      return;
    }
    let envelope: Envelope;
    try {
      envelope = JSON.parse(line) as Envelope;
    } catch {
      return;
    }
    if (typeof envelope.id !== "number") {
      return;
    }
    pending.get(envelope.id)?.resolve(envelope);
    pending.delete(envelope.id);
  };

  child.on("error", (error) =>
    fail(`${label} could not be started: ${error.message}`),
  );
  child.stdin.on("error", (error) => fail(`${label} stopped reading: ${error.message}`));
  child.on("exit", (code, signal) =>
    fail(
      `${label} exited (${signal ?? code})` +
        (stderrTail.trim() === "" ? "" : `: ${stderrTail.trim()}`),
    ),
  );

  const request = (method: string, params: unknown): Promise<Envelope> => {
    if (failure !== undefined) {
      return Promise.reject(new Error(failure));
    }
    const id = nextId++;
    return new Promise<Envelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${label} did not answer ${method} within ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, {
        resolve: (envelope) => {
          clearTimeout(timer);
          resolve(envelope);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  };

  const stop = (): Promise<void> =>
    new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, SHUTDOWN_GRACE_MS);
      timer.unref();
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.stdin.end();
      child.kill();
    });

  try {
    const initialized = await request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "agentflow", version: "0" },
    });
    if (initialized.error !== undefined) {
      throw new Error(
        `${label} refused the handshake: ${initialized.error.message ?? "no reason given"}`,
      );
    }
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  } catch (error) {
    await stop();
    throw error;
  }

  return {
    stop,

    callTool: async (name, args) => {
      const answered = await request("tools/call", { name, arguments: args });
      if (answered.error !== undefined) {
        throw new Error(
          `${label} failed ${name}: ${answered.error.message ?? "no reason given"}`,
        );
      }
      const text = (answered.result?.content ?? [])
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join("\n");
      if (answered.result?.isError === true) {
        throw new Error(`${label} failed ${name}: ${text}`);
      }
      return text;
    },
  };
}
