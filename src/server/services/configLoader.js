import fs from 'node:fs';
import path from 'node:path';

function resolveShell(requestedShell, platformDefault) {
  if (!requestedShell || !requestedShell.trim()) return platformDefault;
  if (process.platform !== 'win32') {
    const lower = requestedShell.trim().toLowerCase();
    if (lower === 'powershell.exe' || lower === 'cmd.exe' || lower === 'powershell') {
      return platformDefault;
    }
  }
  return requestedShell.trim();
}

function slugify(input) {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'cmd';
}

function normalizeGlobal(rawGlobal = {}, { defaultShell, rootDir }) {
  const bufferCandidate = Number(rawGlobal.bufferChars);
  const rawDefaultCwd = typeof rawGlobal.defaultCwd === 'string' && rawGlobal.defaultCwd.trim()
    ? rawGlobal.defaultCwd.trim()
    : rootDir;

  return {
    title: typeof rawGlobal.title === 'string' && rawGlobal.title.trim() ? rawGlobal.title.trim() : 'Terminal Command Manager',
    autoStartOnBoot: rawGlobal.autoStartOnBoot !== false,
    bufferChars: Number.isFinite(bufferCandidate) && bufferCandidate > 1000 ? Math.floor(bufferCandidate) : 30000,
    defaultCwd: path.isAbsolute(rawDefaultCwd) ? rawDefaultCwd : path.resolve(rootDir, rawDefaultCwd),
    defaultShell: resolveShell(rawGlobal.defaultShell, defaultShell),
    defaultEnv: rawGlobal.defaultEnv && typeof rawGlobal.defaultEnv === 'object' ? rawGlobal.defaultEnv : {}
  };
}

function normalizeCommand(rawCommand, index, globalCfg, usedIds, rootDir) {
  if (!rawCommand || typeof rawCommand !== 'object') {
    throw new Error(`Command at index ${index} is not an object.`);
  }

  if (typeof rawCommand.command !== 'string' || !rawCommand.command.trim()) {
    throw new Error(`Command at index ${index} is missing a valid "command" string.`);
  }

  const baseId = rawCommand.id && String(rawCommand.id).trim()
    ? String(rawCommand.id).trim()
    : `${slugify(rawCommand.name || `cmd-${index + 1}`)}-${index + 1}`;

  let id = baseId;
  let suffix = 1;
  while (usedIds.has(id)) {
    suffix += 1;
    id = `${baseId}-${suffix}`;
  }
  usedIds.add(id);

  const rawCwd = typeof rawCommand.cwd === 'string' && rawCommand.cwd.trim()
    ? rawCommand.cwd.trim()
    : globalCfg.defaultCwd;

  return {
    id,
    name: typeof rawCommand.name === 'string' && rawCommand.name.trim() ? rawCommand.name.trim() : `Command ${index + 1}`,
    command: rawCommand.command,
    autoStart: rawCommand.autoStart === true,
    cwd: path.isAbsolute(rawCwd) ? rawCwd : path.resolve(rootDir, rawCwd),
    env: rawCommand.env && typeof rawCommand.env === 'object' ? rawCommand.env : {},
    shell: resolveShell(rawCommand.shell, globalCfg.defaultShell),
    status: 'stopped',
    process: null,
    output: '',
    lastError: null,
    lastExitCode: null,
    stopping: false,
    stopWaiters: []
  };
}

export function loadConfigFromDisk({ configPath, defaultShell, rootDir }) {
  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read config file at ${configPath}: ${error.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in config file ${configPath}: ${error.message}`);
  }

  const global = normalizeGlobal(parsed.global, { defaultShell, rootDir });
  const rawCommands = Array.isArray(parsed.commands) ? parsed.commands : [];
  const usedIds = new Set();
  const commandEntries = rawCommands.map((entry, index) => normalizeCommand(entry, index, global, usedIds, rootDir));

  return {
    config: {
      global,
      commands: commandEntries.map((command) => ({
        id: command.id,
        name: command.name,
        command: command.command,
        autoStart: command.autoStart,
        cwd: command.cwd,
        shell: command.shell,
        env: command.env
      }))
    },
    commandEntries
  };
}
