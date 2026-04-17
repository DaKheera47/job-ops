import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetCodexDeviceAuthForTests,
  disconnectCodexAuth,
  getCodexDeviceAuthSnapshot,
  startCodexDeviceAuth,
} from "./login";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  default: {
    spawn: spawnMock,
  },
}));

function createMockProcess(
  configure: (
    stdout: PassThrough,
    stderr: PassThrough,
    proc: EventEmitter,
  ) => void,
): ChildProcessWithoutNullStreams {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();

  const proc = new EventEmitter() as ChildProcessWithoutNullStreams & {
    killed: boolean;
  };
  proc.stdin = stdin;
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.killed = false;
  proc.kill = vi.fn((signal?: NodeJS.Signals) => {
    proc.killed = true;
    setImmediate(() => {
      proc.emit("exit", 0, signal ?? null);
    });
    return true;
  });

  configure(stdout, stderr, proc);
  return proc;
}

describe("codex device login service", () => {
  afterEach(() => {
    __resetCodexDeviceAuthForTests();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("parses URL and device code from login output", async () => {
    vi.mocked(spawn).mockImplementation(() =>
      createMockProcess((stdout) => {
        setTimeout(() => {
          stdout.write(
            [
              "expires in 15 minutes",
              "\u001b[94mhttps://auth.openai.com/codex/device\u001b[0m",
              "\u001b[94mHU0J-CGNH0\u001b[0m",
            ].join("\n"),
          );
        }, 0);
      }),
    );

    const snapshot = await startCodexDeviceAuth();

    expect(snapshot.status).toBe("running");
    expect(snapshot.loginInProgress).toBe(true);
    expect(snapshot.verificationUrl).toBe(
      "https://auth.openai.com/codex/device",
    );
    expect(snapshot.userCode).toBe("HU0J-CGNH0");
    expect(snapshot.expiresAt).not.toBeNull();

    const current = getCodexDeviceAuthSnapshot();
    expect(current.status).toBe("running");
    expect(current.userCode).toBe("HU0J-CGNH0");
  });

  it("returns existing running session without spawning a second process", async () => {
    vi.mocked(spawn).mockImplementation(() =>
      createMockProcess((stdout) => {
        setTimeout(() => {
          stdout.write("https://auth.openai.com/codex/device\n");
          stdout.write("ABCD-EFGH\n");
        }, 0);
      }),
    );

    const first = await startCodexDeviceAuth();
    const second = await startCodexDeviceAuth();

    expect(vi.mocked(spawn)).toHaveBeenCalledTimes(1);
    expect(second.userCode).toBe(first.userCode);
    expect(second.verificationUrl).toBe(first.verificationUrl);
  });

  it("restarts device auth when forced and returns a new code", async () => {
    vi.mocked(spawn)
      .mockImplementationOnce(() =>
        createMockProcess((stdout) => {
          setTimeout(() => {
            stdout.write("https://auth.openai.com/codex/device\n");
            stdout.write("FIRST-CODE\n");
          }, 0);
        }),
      )
      .mockImplementationOnce(() =>
        createMockProcess((stdout) => {
          setTimeout(() => {
            stdout.write("https://auth.openai.com/codex/device\n");
            stdout.write("SECOND-CODE\n");
          }, 0);
        }),
      );

    const first = await startCodexDeviceAuth();
    const second = await startCodexDeviceAuth(true);

    expect(vi.mocked(spawn)).toHaveBeenCalledTimes(2);
    expect(first.userCode).toBe("FIRST-CODE");
    expect(second.userCode).toBe("SECOND-CODE");
  });

  it("tracks process completion when login exits immediately after printing device code", async () => {
    vi.mocked(spawn).mockImplementation(() =>
      createMockProcess((stdout, _stderr, proc) => {
        setTimeout(() => {
          stdout.write("https://auth.openai.com/codex/device\n");
          stdout.write("ABCD-EFGH\n");
          proc.emit("exit", 0, null);
        }, 0);
      }),
    );

    const snapshot = await startCodexDeviceAuth();
    expect(snapshot.userCode).toBe("ABCD-EFGH");

    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    const current = getCodexDeviceAuthSnapshot();
    expect(current.status).toBe("completed");
    expect(current.loginInProgress).toBe(false);
  });

  it("fails when the login process exits before yielding a device code", async () => {
    vi.mocked(spawn).mockImplementation(() =>
      createMockProcess((_stdout, _stderr, proc) => {
        setTimeout(() => {
          proc.emit("exit", 1, null);
        }, 0);
      }),
    );

    await expect(startCodexDeviceAuth()).rejects.toThrow(
      /device code|login exited/i,
    );
    expect(getCodexDeviceAuthSnapshot().status).toBe("failed");
  });

  it("guides user to security settings when device auth is disabled upstream", async () => {
    vi.mocked(spawn).mockImplementation(() =>
      createMockProcess((stdout, _stderr, proc) => {
        setTimeout(() => {
          stdout.write(
            "Enable device code authorization for Codex in ChatGPT Security Settings, then run `codex login --device-auth` again.\n",
          );
          proc.emit("exit", 1, null);
        }, 0);
      }),
    );

    await expect(startCodexDeviceAuth()).rejects.toThrow(
      /ChatGPT Security Settings/i,
    );
    const snapshot = getCodexDeviceAuthSnapshot();
    expect(snapshot.status).toBe("failed");
    expect(snapshot.message).toMatch(/Security Settings/i);
  });

  it("disconnects codex auth successfully", async () => {
    vi.mocked(spawn).mockImplementation(() =>
      createMockProcess((_stdout, _stderr, proc) => {
        setTimeout(() => {
          proc.emit("exit", 0, null);
        }, 0);
      }),
    );

    const snapshot = await disconnectCodexAuth();
    expect(snapshot.status).toBe("idle");
    expect(snapshot.loginInProgress).toBe(false);
  });

  it("treats already-logged-out state as a successful disconnect", async () => {
    vi.mocked(spawn).mockImplementation(() =>
      createMockProcess((_stdout, stderr, proc) => {
        setTimeout(() => {
          stderr.write("Not logged in.\n");
          proc.emit("exit", 1, null);
        }, 0);
      }),
    );

    const snapshot = await disconnectCodexAuth();
    expect(snapshot.status).toBe("idle");
    expect(snapshot.loginInProgress).toBe(false);
  });
});
