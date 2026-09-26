import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import { createCommandManager } from "./services/commandManager.js";
import { registerSocketHandlers } from "./transport/socketHandlers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

export async function startServer(options = {}) {
  const configPath = options.configPath || process.env.TERMINAL_CONFIG_PATH;
  if (!configPath) {
    throw new Error("A config file is required. Pass --config <file> or set TERMINAL_CONFIG_PATH.");
  }
  const defaultPort = Number(options.port || process.env.PORT || 3005);
  const defaultShell = process.platform === "win32" ? "powershell.exe" : (process.env.SHELL || "bash");

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  app.use(express.static(path.join(rootDir, "public")));

  const manager = createCommandManager({
    io,
    configPath,
    defaultShell,
    rootDir: path.dirname(configPath),
  });

  await manager.initialize();
  registerSocketHandlers(io, manager);

  const shutdown = async () => {
    await manager.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  server.listen(defaultPort, () => {
    console.log(`Server running on http://localhost:${defaultPort}`);
    console.log(`Using config file: ${configPath}`);
  });
}
