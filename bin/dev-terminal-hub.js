#!/usr/bin/env node
import path from 'node:path';
import { startServer } from '../src/server/index.js';

function readOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--config' || arg === '-c') {
      const value = args[++index];
      if (!value) throw new Error(`${arg} requires a file path.`);
      options.configPath = path.resolve(value);
    } else if (arg === '--port' || arg === '-p') {
      const value = Number(args[++index]);
      if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new Error(`${arg} requires a port between 1 and 65535.`);
      }
      options.port = value;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: dev-terminal-hub [--config <file>] [--port <port>]');
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

const options = readOptions(process.argv.slice(2));
if (options.configPath) process.env.TERMINAL_CONFIG_PATH = options.configPath;

startServer(options).catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
