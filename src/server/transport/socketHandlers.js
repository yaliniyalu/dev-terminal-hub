export function registerSocketHandlers(io, manager) {
  function emitError(socket, message) {
    socket.emit('operation:error', { message });
  }

  io.on('connection', (socket) => {
    socket.emit('state:snapshot', manager.snapshot());

    socket.on('command:run', ({ id }) => {
      const result = manager.runCommand(id);
      if (!result.ok) {
        emitError(socket, result.error || 'Unable to run command.');
      }
    });

    socket.on('command:stop', async ({ id }) => {
      const result = await manager.stopCommand(id);
      if (!result.ok) {
        emitError(socket, result.error || 'Unable to stop command.');
      }
    });

    socket.on('command:restart', async ({ id }) => {
      const result = await manager.restartCommand(id);
      if (!result.ok) {
        emitError(socket, result.error || 'Unable to restart command.');
      }
    });

    socket.on('commands:runAll', async () => {
      await manager.runAllCommands();
    });

    socket.on('commands:stopAll', async () => {
      await manager.stopAllCommands();
    });

    socket.on('commands:restartAll', async () => {
      await manager.restartAllCommands();
    });

    socket.on('config:reload', async () => {
      try {
        await manager.reloadConfig();
      } catch (error) {
        emitError(socket, error.message || 'Unable to reload config.');
      }
    });

    socket.on('command:input', ({ id, data }) => {
      manager.writeInput(id, data);
    });

    socket.on('command:resize', ({ id, cols, rows }) => {
      manager.resizeCommand(id, cols, rows);
    });
  });
}
