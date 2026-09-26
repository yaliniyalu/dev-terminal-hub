import pty from 'node-pty';
import { loadConfigFromDisk } from './configLoader.js';

export function createCommandManager({ io, configPath, defaultShell, rootDir }) {
  const runtime = {
    configPath,
    config: {
      global: {
        title: 'Terminal Command Manager',
        autoStartOnBoot: true,
        bufferChars: 30000,
        defaultCwd: rootDir,
        defaultShell,
        defaultEnv: {}
      },
      commands: []
    },
    commands: new Map()
  };

  function toPublicState(command) {
    return {
      id: command.id,
      name: command.name,
      command: command.command,
      autoStart: command.autoStart,
      cwd: command.cwd,
      shell: command.shell,
      env: command.env,
      status: command.status,
      pid: command.process ? command.process.pid : null,
      output: command.output,
      lastError: command.lastError,
      lastExitCode: command.lastExitCode
    };
  }

  function snapshot() {
    return {
      configPath: runtime.configPath,
      global: runtime.config.global,
      commands: Array.from(runtime.commands.values()).map(toPublicState)
    };
  }

  function broadcastSnapshot() {
    io.emit('state:snapshot', snapshot());
  }

  function broadcastStatus(command) {
    io.emit('command:status', toPublicState(command));
  }

  function appendOutput(command, chunk) {
    command.output += chunk;
    const maxChars = runtime.config.global.bufferChars;
    if (command.output.length > maxChars) {
      let trimmed = command.output.slice(command.output.length - maxChars);
      // Avoid starting the buffer mid-escape-sequence by advancing to the next newline
      const firstNewline = trimmed.indexOf('\n');
      if (firstNewline > 0) {
        trimmed = trimmed.slice(firstNewline + 1);
      }
      command.output = trimmed;
    }
  }

  function resolveStopWaiters(command) {
    const waiters = command.stopWaiters.splice(0, command.stopWaiters.length);
    waiters.forEach((resolve) => resolve());
  }

  function getSpawnPlan(command) {
    const shell = command.shell || runtime.config.global.defaultShell || defaultShell;

    if (process.platform === 'win32') {
      const lowered = shell.toLowerCase();
      if (lowered.includes('powershell')) {
        return { shell, args: ['-NoLogo', '-NoProfile', '-Command', command.command] };
      }
      if (lowered.includes('cmd')) {
        return { shell, args: ['/d', '/s', '/c', command.command] };
      }
      return { shell, args: ['-c', command.command] };
    }

    return { shell, args: ['-lc', command.command] };
  }

  function runCommand(commandId) {
    const command = runtime.commands.get(commandId);
    if (!command) {
      return { ok: false, error: `Unknown command id: ${commandId}` };
    }

    if (command.process || command.status === 'starting') {
      return { ok: true, skipped: true };
    }

    command.status = 'starting';
    command.lastError = null;
    command.lastExitCode = null;
    command.stopping = false;
    broadcastStatus(command);

    const { shell, args } = getSpawnPlan(command);

    try {
      const env = {
        ...process.env,
        ...runtime.config.global.defaultEnv,
        ...command.env
      };

      const ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-color',
        cols: 120,
        rows: 34,
        cwd: command.cwd,
        env
      });

      command.process = ptyProcess;
      command.status = 'running';
      broadcastStatus(command);

      ptyProcess.onData((data) => {
        appendOutput(command, data);
        io.emit('command:output', { id: command.id, data });
      });

      ptyProcess.onExit(({ exitCode, signal }) => {
        command.process = null;
        command.lastExitCode = Number.isFinite(exitCode) ? exitCode : null;

        if (command.stopping || exitCode === 0) {
          command.status = 'stopped';
        } else {
          command.status = 'error';
          command.lastError = `Exited with code ${exitCode}${signal ? ` (signal: ${signal})` : ''}`;
        }

        command.stopping = false;
        broadcastStatus(command);
        resolveStopWaiters(command);
      });

      return { ok: true };
    } catch (error) {
      command.process = null;
      command.status = 'error';
      command.lastError = error.message;
      broadcastStatus(command);
      resolveStopWaiters(command);
      return { ok: false, error: error.message };
    }
  }

  function stopCommand(commandId) {
    const command = runtime.commands.get(commandId);
    if (!command) {
      return Promise.resolve({ ok: false, error: `Unknown command id: ${commandId}` });
    }

    if (!command.process) {
      command.status = 'stopped';
      broadcastStatus(command);
      return Promise.resolve({ ok: true, skipped: true });
    }

    return new Promise((resolve) => {
      command.stopping = true;
      const waiter = () => resolve({ ok: true });
      command.stopWaiters.push(waiter);

      try {
        command.process.kill();
      } catch (error) {
        command.stopWaiters = command.stopWaiters.filter((pendingWaiter) => pendingWaiter !== waiter);
        command.stopping = false;
        command.status = 'error';
        command.lastError = error.message;
        broadcastStatus(command);
        resolve({ ok: false, error: error.message });
      }
    });
  }

  async function restartCommand(commandId) {
    const stopResult = await stopCommand(commandId);
    if (!stopResult.ok) {
      return stopResult;
    }
    return runCommand(commandId);
  }

  async function runAllCommands() {
    const results = [];
    for (const command of runtime.commands.values()) {
      results.push({ id: command.id, ...runCommand(command.id) });
    }
    return results;
  }

  async function stopAllCommands() {
    const ops = Array.from(runtime.commands.values()).map(async (command) => ({
      id: command.id,
      ...(await stopCommand(command.id))
    }));
    return Promise.all(ops);
  }

  async function restartAllCommands() {
    const ops = Array.from(runtime.commands.values()).map(async (command) => ({
      id: command.id,
      ...(await restartCommand(command.id))
    }));
    return Promise.all(ops);
  }

  async function autoStartConfiguredCommands() {
    if (!runtime.config.global.autoStartOnBoot) {
      return;
    }

    for (const command of runtime.commands.values()) {
      if (command.autoStart) {
        runCommand(command.id);
      }
    }
  }

  function applyLoadedConfig(loaded) {
    runtime.config = loaded.config;
    runtime.commands = new Map(loaded.commandEntries.map((entry) => [entry.id, entry]));
  }

  function loadConfig() {
    const loaded = loadConfigFromDisk({
      configPath: runtime.configPath,
      defaultShell,
      rootDir
    });

    applyLoadedConfig(loaded);
  }

  async function reloadConfig() {
    await stopAllCommands();
    loadConfig();
    broadcastSnapshot();
    await autoStartConfiguredCommands();
    broadcastSnapshot();
  }

  async function initialize() {
    loadConfig();
    await autoStartConfiguredCommands();
  }

  function writeInput(id, data) {
    const command = runtime.commands.get(id);
    if (!command || !command.process || typeof data !== 'string') {
      return;
    }
    command.process.write(data);
  }

  function resizeCommand(id, cols, rows) {
    const command = runtime.commands.get(id);
    if (!command || !command.process || !Number.isFinite(cols) || !Number.isFinite(rows)) {
      return;
    }
    command.process.resize(cols, rows);
  }

  async function shutdown() {
    await stopAllCommands();
  }

  return {
    initialize,
    snapshot,
    runCommand,
    stopCommand,
    restartCommand,
    runAllCommands,
    stopAllCommands,
    restartAllCommands,
    reloadConfig,
    writeInput,
    resizeCommand,
    shutdown
  };
}
