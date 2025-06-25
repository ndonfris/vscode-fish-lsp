import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { FishWorkspace, FishWorkspaceCollection } from './workspace';
import { fishPath } from './extension';

type TraceLevel = 'off' | 'messages' | 'verbose';

/**
 * extension `settings.json` configuration typing
 */
export type FishLspConfig = {
  readonly enable: boolean;
  readonly trace: TraceLevel;
  readonly useGlobalExecutable: boolean;
  readonly executablePath: string;
  readonly workspaceFolders: readonly string[];
  readonly enableWorkspaceFolders: boolean;
};

const parseConfig = (): FishLspConfig => {
  const config = vscode.workspace.getConfiguration('fish-lsp');
  return {
    enable: config.get('enable', true),
    trace: config.get('trace.server', 'off'),
    useGlobalExecutable: config.get('useGlobalExecutable', false),
    executablePath: config.get('executablePath', ''),
    workspaceFolders: config.get('workspaceFolders', []),
    enableWorkspaceFolders: config.get('enableWorkspaceFolders', false)
  } as FishLspConfig;
};

/**
 * Exported configuration object
 */
export const config = parseConfig();

/**
 * Utilities for logging and displaying messages in VSCode.
 */
export type MessageOpts = { override: boolean; modal: boolean; };
export type WindowLogger = {
  log: (t: string, opts?: Partial<MessageOpts>) => void;
  info: (t: string, opts?: Partial<MessageOpts>) => void;
  warn: (t: string, opts?: Partial<MessageOpts>) => void;
  debug: (t: string, opts?: Partial<MessageOpts>) => void;
  error: (t: string, opts?: Partial<MessageOpts>) => void;
};
function windowShowMessage(_window: typeof vscode.window, loggingVerbosity: TraceLevel) {
  const defaultOpts: MessageOpts = { override: false, modal: false };
  type LogType = 'log' | 'info' | 'warn' | 'debug' | 'error';

  const getWindowCallback = (type: LogType) => {
    switch (type) {
      case 'log':
        return _window.showInformationMessage;
      case 'info':
        return _window.showInformationMessage;
      case 'debug':
        return _window.showInformationMessage;
      case 'warn':
        return _window.showWarningMessage;
      case 'error':
        return _window.showErrorMessage;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  };

  const showWindow = (type: LogType, t: string, opts: Partial<MessageOpts> = defaultOpts) => {
    if (!opts.override && loggingVerbosity === 'off') return;
    const showFn = getWindowCallback(type);
    if (opts.modal) {
      showFn(t, { modal: true });
    } else {
      showFn(t);
    }
  };

  return {
    log: (t: string, opts: Partial<MessageOpts> = defaultOpts) => {
      console.log(t);
      showWindow('log', t, opts);
    },
    info: (t: string, opts: Partial<MessageOpts> = defaultOpts) => {
      console.info(t);
      showWindow('info', t, opts);
    },
    warn: (t: string, opts: Partial<MessageOpts> = defaultOpts) => {
      console.warn(t);
      showWindow('warn', t, opts);
    },
    debug: (t: string, opts: Partial<MessageOpts> = defaultOpts) => {
      console.debug(t);
      showWindow('debug', t, opts);
    },
    error: (t: string, opts: Partial<MessageOpts> = defaultOpts) => {
      console.error(t);
      showWindow('error', t, opts);
    }
  } as WindowLogger;
}

// Export window logging wrapper, to include the logs in the extension output channel,
// if the extension trace level is set to 'verbose' or 'messages'. Otherwise, forward
// the message to their respective `console` methods.
export const winlog: WindowLogger = windowShowMessage(vscode.window, config.trace);

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
/**
 * Global environment variables, initialized from the fish shell, inside the extension,
 * from the function `initializeFishEnvironment()`. The new values set from fish shell
 * are merged with the existing `process.env` variables, inside the function 
 * `getFishEnvironment()`. Use `env` as the global environment variable object.
 *
 * Note: We use a singleton instead of the default `process.env` to allow for reading
 *       fish's autoloaded environment variables, which are not available in the Node.js.
 *       An example autoloaded environment variable would be `__fish_data_dir`, which
 *       the user could use in their `$fish_lsp_all_indexed_workspaces` definition.
 */
export let env = process.env;
/**
 * Call this in 
 */
export const initializeFishEnvironment = async () => {
  try {
    env = await getFishEnvironment(fishPath);
    winlog.info(`Initialized fish environment with ${Object.keys(env).length} variables.`);
  } catch (error) {
    winlog.error(`Failed to initialize fish environment: ${error}`);
  }
}

export async function getFishValue(
  key: string,
  fishPath: string = 'fish',
): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(fishPath, [
      '-c',
      `echo (set -q ${key}; and echo $${key})`
    ]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}


/**
 * Type alias for path-like strings, which can be used to represent any file or directory path.
 *
 * Normally a we consider the path-like object to be a regular unix file path.
 *
 * NOTE: The server will make uris seem path-like, by converting a path to a `file://${uri}` string.
 *       However, a we can just call `vscode.uri.parse(pathLike)` on these cases.
 */
export type PathLike = string;

/**
 * Utility functions for file and path operations. Exports a set of `path` and `fs` related utilities.
 * Includes type guard `PathUtils.is()` to ensure a value is a `PathLike` string.
 */
export const PathUtils = {
  exists: (filepath: string): boolean => {
    try {
      return fs.existsSync(filepath);
    } catch {
      return false;
    }
  },

  isDirectory: (filepath: string): boolean => {
    try {
      return fs.statSync(filepath).isDirectory();
    } catch {
      return false;
    }
  },

  isFile: (filepath: string): boolean => {
    try {
      return fs.statSync(filepath).isFile();
    } catch {
      return false;
    }
  },

  // Check if a file is executable, used for user specifying `fish-lsp` executable in config
  isExecutable: (filepath: string): boolean => {
    try {
      // First check if file exists and is actually a file
      if (!PathUtils.exists(filepath) || !PathUtils.isFile(filepath)) {
        return false;
      }

      // Try using fs.access with X_OK first (works on both Unix and Windows)
      try {
        fs.accessSync(filepath, fs.constants.X_OK);
        return true;
      } catch {
        console.warn(`fs.accessSync failed for ${filepath}, falling back to platform-specific checks.`);
        return false;
        // fs.access failed, fall back to platform-specific checks
      }
    } catch (err) {
      console.error(`Error checking if file is executable: ${err}`);
      return false;
    }
  },

  basename: (filepath: string): string => path.basename(filepath),
  dirname: (filepath: string): string => path.dirname(filepath),
  join: (...filepaths: string[]): string => path.join(...filepaths),
  resolve: (...filepaths: string[]): string => path.resolve(...filepaths),
  normalize: (filepath: string): string => path.normalize(filepath),
  relative: (from: string, to: string): string => path.relative(from, to),

  // Additional utilities
  isAbsolute: (filepath: string): boolean => path.isAbsolute(filepath),
  extname: (filepath: string): string => path.extname(filepath),

  ensureAbsolute: (filepath: string, cwd: string = process.cwd()): string => {
    return PathUtils.isAbsolute(filepath) ? filepath : PathUtils.resolve(cwd, filepath);
  },

  /**
   * Type guard to check if a value is a PathLike.
   */
  is: (value: unknown): value is PathLike => {
    // if the value is a UriUtils
    if (UriUtils.is(value)) return false; // vscode.Uri is not a PathLike
    return (
      typeof value === 'string'
      && value.toString().length > 0
      && value.includes(path.sep || '/')
    );
  },
} as const;

/**
 * Utility functions for URI Operations, mainly for type checking and parsing
 */
export namespace UriUtils {

  /**
   * Type guard to check if a value is a vscode.Uri
   */
  export const is = (value: unknown): value is vscode.Uri => {
    return (
      typeof value === 'object' &&
      value !== null &&
      'scheme' in value &&
      'fsPath' in value &&
      'toString' in value &&
      typeof (value as any).scheme === 'string' &&
      typeof (value as any).fsPath === 'string' &&
      typeof (value as any).toString === 'function'
    );
  };

  export const parse = (input: PathLike | vscode.Uri): vscode.Uri => {
    if (PathUtils.is(input)) return vscode.Uri.parse(input);
    if (UriUtils.is(input)) return input;
    throw new Error('Invalid URI input');
  };

  export const toPathSafe = (uri: PathLike | vscode.Uri): PathLike => {
    const parsedUri = UriUtils.parse(uri);
    return parsedUri.fsPath;
  };

  export const fromPath = (path: PathLike): vscode.Uri => {
    return UriUtils.parse(path);
  };
}

/**
 * Utility functions for TextDocument Operations, mainly for type checking
 */
export namespace TextDocumentUtils {

  export const is = (value: unknown): value is vscode.TextDocument => {
    return (
      typeof value === 'object' &&
      value !== null &&
      'uri' in value &&
      'getText' in value &&
      'languageId' in value &&
      typeof (value as any).uri === 'object' &&
      UriUtils.is((value as any).uri) &&
      typeof (value as any).getText === 'function' &&
      typeof (value as any).languageId === 'string'
    );
  };

  export const isFishDocument = (doc?: vscode.TextDocument): boolean => {
    return TextDocumentUtils.is(doc) && doc.languageId === 'fish';
  };

  export const isExistingFishDocument = (doc: vscode.TextDocument): boolean => {
    return TextDocumentUtils.isFishDocument(doc)
      && PathUtils.exists(doc.uri.fsPath)
      && PathUtils.isFile(doc.uri.fsPath);
  };

  export function getInitialFishWorkspaceFolder(
    workspaces: FishWorkspaceCollection,
    doc?: vscode.TextDocument,
  ) {
    if (!doc || !TextDocumentUtils.isExistingFishDocument(doc)) {
      return undefined;
    }
    // add document's parent directory as a subworkspace
    const subworkspace = FishWorkspace.create(doc.uri)
    if (subworkspace && !workspaces.has(subworkspace.uri)) {
      workspaces.add(subworkspace);
    }

    // Get the workspace folder for the document
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
    let newFolder: FishWorkspace | undefined;
    if (WorkspaceFolderUtils.is(workspaceFolder)) {
      newFolder = FishWorkspace.fromWorkspaceFolder(workspaceFolder);
      if (!workspaces.has(workspaceFolder.uri) && config.enableWorkspaceFolders) {
        workspaces.add(newFolder);
      }
    } else {
      newFolder = FishWorkspace.create(doc.uri.fsPath);
      if (newFolder && !workspaces.has(newFolder.uri) && config.enableWorkspaceFolders) {
        workspaces.add(newFolder);
      }
    }
    // questionable addition to global workspace folders
    // if (newFolder && config.enableWorkspaceFolders && !vscode.workspace.getWorkspaceFolder(doc.uri)) {
    //   vscode.workspace.updateWorkspaceFolders(
    //     0,
    //     1,
    //     newFolder?.toVSCodeWorkspaceFolder()
    //   );
    // }
    return newFolder;
  }
}

/**
 * Utility functions for WorkspaceFolder Operations, mainly for type checking
 */
export namespace WorkspaceFolderUtils {

  /**
   * Type guard to check if a value is a vscode.WorkspaceFolder or FishWorkspace
   */
  export const is = (value: unknown): value is vscode.WorkspaceFolder => {
    return (
      typeof value === 'object' &&
      value !== null &&
      'uri' in value &&
      'name' in value &&
      'index' in value &&
      typeof (value as any).uri === 'object' &&
      UriUtils.is((value as any).uri) &&
      typeof (value as any).name === 'string' &&
      typeof (value as any).index === 'number'
    );
  };

  export type ChangeEventWorkspace = {
    readonly uri: string;
    readonly name: string;
  };

  /**
   * Remove unnecessary properties from a Client WorkspaceWolders that aren't needed for Server Workspace objects
   */
  export const toShorthand = (folder: vscode.WorkspaceFolder | FishWorkspace): ChangeEventWorkspace => {
    return { name: folder.name, uri: folder.uri.toString() };
  };

  /**
   * Make sure the event for changing WorkspaceFolder event request, the server
   * receives the event properties excluding unnecessary client WorkspaceFolder
   * properties like `WorkspaceFolder.index`
   */
  export const toChangeEvent = (e: vscode.WorkspaceFoldersChangeEvent): { added: ChangeEventWorkspace[]; removed: ChangeEventWorkspace[]; } => {
    return {
      added: e.added.map(folder => WorkspaceFolderUtils.toShorthand(folder)),
      removed: e.removed.map(folder => WorkspaceFolderUtils.toShorthand(folder)),
    };
  };

  export const getVSCodeWorkspaceFolders = () => {
    return vscode.workspace.workspaceFolders?.map(folder => folder) || [];
  }
}

