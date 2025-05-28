import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ExtensionContext, window, WorkspaceConfiguration } from 'vscode';
const execFileAsync = promisify(execFile);

/**
 * ~/.vscode/extensions/fish-lsp-.../node_modules/fish-lsp/bin/fish-lsp
 */
function extensionFishLspPath(context: ExtensionContext): string {
  return path.join(
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
export async function getServerPath(context: ExtensionContext, config: WorkspaceConfiguration): Promise<string> {
  // Determine which fish-lsp executable to use
  let serverPath: string;

  const useGlobalExecutable = config.get<boolean>('useGlobalExecutable', false);
  const executablePath = config.get<string>('executablePath', '');

  if (executablePath.trim() !== '') {
    serverPath = executablePath;
    console.log('Using configured `fish-lsp.executablePath` at:', serverPath);

  } else if (useGlobalExecutable) {
    try {
      // Use 'which' on Unix/Linux/macOS or 'where' on Windows to find global executable
      serverPath = (await getCommandFilePath('fish-lsp')) || '';
      console.log('Using globally installed fish-lsp at:', serverPath);
    } catch (err) {
      console.log('Global fish-lsp not found, falling back to bundled version', err);
      serverPath = extensionFishLspPath(context);
    }
  } else {
    serverPath = extensionFishLspPath(context);
    console.log('Using bundled fish-lsp as configured');
  }

  // Verify server path exists and is executable
  try {
    await fs.promises.access(serverPath, fs.constants.X_OK);
    console.log('Server path exists and is executable:', serverPath);
  } catch (pathErr) {
    console.error('Server path error:', pathErr);
    window.showErrorMessage(`Failed to find fish-lsp binary at ${serverPath}`);
    throw pathErr;
  }
  return serverPath;
}
