# Dev Terminal Hub

A browser based manager for starting and controlling project commands through a web interface.

## Install in a project

From the project that should host the terminal:

```sh
npm install --save-dev <path-to-dev-terminal-hub>
```

The package includes `node-pty`, which builds a native module during installation. Install the dependencies with the same package manager used by the host project.

Create a config file in the host project's root. Pass its path explicitly with `--config`; the hub does not search the host project automatically. Paths in `defaultCwd` and command `cwd` values are relative to the config file's directory.

```json
{
  "global": {
    "title": "My Project",
    "autoStartOnBoot": false,
    "bufferChars": 30000,
    "defaultCwd": ".",
    "defaultShell": "powershell.exe",
    "defaultEnv": {}
  },
  "commands": [
    {
      "id": "app",
      "name": "App",
      "command": "npm run dev",
      "autoStart": true,
      "cwd": ".",
      "env": {}
    }
  ]
}
```

Add a script to the host project's `package.json`:

```json
{
  "scripts": {
    "terminal-hub": "dev-terminal-hub --config ./config/dev-commands.json"
  }
}
```

Run `npm run terminal-hub` and open <http://localhost:3005>. Set `PORT` to use another port. The CLI also accepts `--config <file>` and `--port <port>`.

For local development in this repository, run `npm install` and then `npm start`. This uses the repository-only `dev.config.json`.
