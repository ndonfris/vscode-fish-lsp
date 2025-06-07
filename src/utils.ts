import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  window,
  WorkspaceFolder
} from 'vscode';

export type MessageOpts = {
  override: boolean;
  modal: boolean;
};

export function showMessage(_window: typeof window, loggingVerbosity: string) {
  const defaultOpts: MessageOpts = {
    override: false,
    modal: false
  };
  return {
    info: (t: string, opts: Partial<MessageOpts> = defaultOpts) => {
      console.log(t);
      if (!opts.override && loggingVerbosity === 'off') return;
      if (opts.modal) {
        _window.showInformationMessage(t, { modal: true });
      } else {
        _window.showInformationMessage(t);
      }
    },
    error: (t: string, opts: Partial<MessageOpts> = defaultOpts) => {
      console.log(t);
      if (!opts.override && loggingVerbosity === 'off') return;
      if (opts.modal) {
        _window.showErrorMessage(t, { modal: true });
      } else {
        _window.showErrorMessage(t);
      }
    }
  };
}

export type ShowMessage = ReturnType<typeof showMessage>;


export const workspaceShortHand = (folder: WorkspaceFolder): {
  uri: string;
  name: string;
} => {
  return {
    uri: folder.uri.toString(),
    name: folder.name
  };
};
                                                    
export const execFileAsync = promisify(execFile);
export async function getFishEnvironment(fishPath: string = 'fish'): Promise<typeof process.env> {
  try {
    const { stdout } = await execFileAsync(fishPath, [
      '-c', 
      'env'
    ]);
    
    const fishEnv: Record<string, string> = {};
    stdout.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        fishEnv[key] = valueParts.join('=');
      }
    });
    return { ...fishEnv, ...process.env };
  } catch {
    return process.env;
  }
}
