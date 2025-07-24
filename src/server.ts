import path from 'path';
import { config, execFileAsync, PathUtils, winlog } from './utils';
import { env, ExtensionContext } from 'vscode';
import { ServerOptions, TransportKind } from 'vscode-languageclient/node';

/**
 * ~/.vscode/extensions/fish-lsp-.../node_modules/fish-lsp/bin/fish-lsp
 */
export function extensionFishLspPath(context: ExtensionContext): string {
  return PathUtils.join(
    context.extensionPath,
    'node_modules',
    'fish-lsp',
    'bin',
    'fish-lsp'
  );
}

/**
 * Use this for finding the path to the `fish-lsp`/`fish` executable
 */
export async function getCommandFilePath(...command: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      process.platform === 'win32' ? 'where' : 'which',
      command
    );
    return stdout.trim().split('\n').at(0);
  } catch (err) {
    console.error('Error finding command:', err);
    return undefined;
  }
}

/**
 * Get the path to the fish-lsp executable to use. By default, this will be the bundled version of fish-lsp.
 * The three possible configurations are listed below:
 *   - no configuration: use the bundled version of fish-lsp
 *   - useGlobalExecutable: use the globally installed version of fish-lsp (if found from `which fish-lsp`)
 *   - executablePath: use the configured path to the fish-lsp executable. Will override the other two options
 */
export async function getServerPath(context: ExtensionContext): Promise<string> {
  // Determine which fish-lsp executable to use
  const extServerPath: string = extensionFishLspPath(context);
  let serverPath: string = extServerPath;

  const useGlobalExecutable = config.useGlobalExecutable;
  const executablePath = config.executablePath;

  if (executablePath.trim() !== '') {
    if (!PathUtils.isExecutable(executablePath)) {
      winlog.warn(`Configured fish-lsp executable at '${executablePath}' is not executable.`);
    } else {
      serverPath = executablePath;
      winlog.log(`Using configured 'fish-lsp.executablePath' at: ${serverPath}`);
    }
  } else if (useGlobalExecutable) {
    const globalServerPath = await getCommandFilePath('fish-lsp');
    if (globalServerPath) {
      winlog.log(`Using global fish-lsp executable at: '${globalServerPath}'`);
      serverPath = globalServerPath;
    } else {
      winlog.warn('Global fish-lsp executable not found, falling back to bundled version');
    }
  } else {
    serverPath = extServerPath;
    winlog.log('Using bundled fish-lsp as configured');
  }

  // Verify server path exists and is executable
  if (!PathUtils.isExecutable(serverPath)) {
    if (PathUtils.isExecutable(extServerPath)) {
      winlog.warn(`Invalid 'settings.json' fish-lsp server related value. Using bundled fish-lsp at '${extServerPath}' instead.`, { override: true });
      serverPath = extServerPath;
      return serverPath;
    }
    winlog.error(`Server path '${serverPath}' is not executable.`, { override: true });
    throw new Error(`'fish-lsp' binary at '${serverPath}' is not executable.`);
  }
  return serverPath;
}

const isUsingProcessCommand = () => {
  if (config.executablePath.trim() !== '' && PathUtils.isExecutable(config.executablePath)) {
    return true;
  }
  if (config.useGlobalExecutable) {
    return PathUtils.isExecutable('fish-lsp');
  }
  return false;
};

/**
 * Create the server options for the language client
 */
export async function createServerOptions(context: ExtensionContext): Promise<ServerOptions> {
  winlog.log('Creating server options for fish-lsp');
  if (isUsingProcessCommand()) {
    console.log('Using global process\'s fish-lsp as configured');
    const serverPath = await getServerPath(context);
    return {
      command: serverPath,
      args: ['start'],
      options: {
        env: {
          ...env,
          // Add any additional environment variables if needed
        },
      },
    };
  }
  // If not using a process command, use the bundled server module
  const serverModule = context.asAbsolutePath(path.join('out', 'server-module.js'));
  console.log(`Using server module at: ${serverModule}`);
  const runCommand: ServerOptions = {
    module: serverModule,
    transport: TransportKind.ipc,
    // options: {
    //   env,
    // }
  };
  const debugCommand: ServerOptions = {
    ...runCommand,
    options: {
      ...runCommand.options,
      execArgv: ['--nolazy', '--inspect=6009'],
    }
  };
  return {
    run: runCommand,
    debug: debugCommand,
  };
}

