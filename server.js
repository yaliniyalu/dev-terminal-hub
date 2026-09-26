
import { startServer } from './src/server/index.js';

startServer({ configPath: process.env.TERMINAL_CONFIG_PATH }).catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
