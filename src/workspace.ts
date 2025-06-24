import * as vscode from 'vscode';
import * as fs from 'fs';
import { config, getFishValue, PathUtils, TextDocumentUtils, UriUtils, WorkspaceFolderUtils } from './utils';

export type WorkspaceInput = vscode.WorkspaceFolder | fs.PathLike | FishWorkspace | vscode.Uri | vscode.TextDocument;

// Pure functions for workspace detection and manipulation
const FISH_DIRS = ['functions', 'completions', 'conf.d'] as const;
const CONFIG_FILE = 'config.fish';

/**
 * Checks if directory contains fish subdirectories
 */
const hasFishDirectories = (dirPath: string): boolean =>
  FISH_DIRS.some(dir => PathUtils.exists(PathUtils.join(dirPath, dir)));

/**
 * Checks if directory contains config.fish file
 */
const hasConfigFile = (dirPath: string): boolean =>
  PathUtils.exists(PathUtils.join(dirPath, CONFIG_FILE));

/**
 * Checks if path is a valid fish workspace directory
 */
const isFishWorkspacePath = (dirPath: string): boolean =>
  PathUtils.isDirectory(dirPath) && (hasFishDirectories(dirPath) || hasConfigFile(dirPath));

/**
 * Walks up directory tree to find fish workspace root
 */
const findWorkspaceRoot = (filePath: string): string | undefined => {
  // Handle temporary directories
  if (filePath.startsWith('/tmp')) return filePath;

  const fileName = PathUtils.basename(filePath);

  // Handle specific fish directory names and config file
  if (FISH_DIRS.includes(fileName as any) || fileName === CONFIG_FILE) {
    return PathUtils.dirname(filePath);
  }

  // Start from directory if input is a file
  let current = PathUtils.isDirectory(filePath) ? filePath : PathUtils.dirname(filePath);

  // Walk up the directory tree
  while (current !== PathUtils.dirname(current)) {
    if (isFishWorkspacePath(current)) {
      return current;
    }
    current = PathUtils.dirname(current);
  }

  return undefined;
};

/**
 * Extracts file path from various input types
 */
const extractPath = (input: WorkspaceInput | unknown): string | undefined => {
  switch (true) {
    case typeof input === 'string' && PathUtils.is(input):
      return PathUtils.normalize(input.toString());
    case UriUtils.is(input):
      return input.fsPath;
    case WorkspaceFolderUtils.is(input):
    case TextDocumentUtils.is(input):
      return input.uri.fsPath;
    case FishWorkspace.is(input):
      return input.path;
    default:
      return undefined;
  }
};

/**
 * Checks if workspace contains the given file path
 */
const workspaceContains = (workspace: { path: string; }, filePath: string): boolean => {
  const fileRoot = findWorkspaceRoot(filePath);
  return fileRoot ? fileRoot.startsWith(workspace.path) || fileRoot === workspace.path : false;
};

/**
 * Creates a workspace object from path (pure function version)
 */
const createWorkspaceFromPath = (path: string, index: number = 0): { name: string; uri: vscode.Uri; path: string; index: number; } | undefined => {
  const rootPath = findWorkspaceRoot(path);
  if (!rootPath) return undefined;

  return {
    name: PathUtils.basename(rootPath),
    uri: vscode.Uri.file(rootPath),
    path: rootPath,
    index
  };
};

// FishWorkspace class - now much more concise!
export class FishWorkspace {
  private static counter = 0;

  private constructor(
    public readonly name: string,
    public readonly uri: vscode.Uri,
    public readonly path: string,
    public readonly index: number = FishWorkspace.counter++
  ) {
    FishWorkspace.counter = Math.max(FishWorkspace.counter, this.index);
  }

  /**
   * Creates a FishWorkspace from various input types
   */
  static create(input: WorkspaceInput, index?: number): FishWorkspace | undefined {
    const path = extractPath(input);
    if (!path) return undefined;

    const workspaceData = createWorkspaceFromPath(path, index ?? FishWorkspace.counter);
    if (!workspaceData) return undefined;

    return new FishWorkspace(
      workspaceData.name,
      workspaceData.uri,
      workspaceData.path,
      workspaceData.index
    );
  }

  /**
   * Type guard to check if a value is a FishWorkspace
   */
  static is(value: unknown): value is FishWorkspace {
    return (
      typeof value === 'object' &&
      value !== null &&
      'name' in value &&
      'uri' in value &&
      'path' in value &&
      'index' in value &&
      'contains' in value &&
      'equals' in value &&
      'toVSCodeWorkspaceFolder' in value &&
      'toServerWorkspace' in value &&
      typeof (value as any).name === 'string' &&
      UriUtils.is((value as any).uri) &&
      typeof (value as any).path === 'string' &&
      typeof (value as any).index === 'number' &&
      typeof (value as any).contains === 'function' &&
      typeof (value as any).equals === 'function' &&
      typeof (value as any).toVSCodeWorkspaceFolder === 'function' &&
      typeof (value as any).toServerWorkspace === 'function'
    );
  }

  /**
   * Creates a FishWorkspace from a VSCode WorkspaceFolder
   */
  static fromWorkspaceFolder(folder: vscode.WorkspaceFolder): FishWorkspace {
    return new FishWorkspace(folder.name, folder.uri, folder.uri.fsPath, folder.index);
  }

  /**
   * Checks if this workspace contains the given input
   */
  contains(input: WorkspaceInput): boolean {
    const inputPath = extractPath(input);
    return inputPath ? workspaceContains(this, inputPath) : false;
  }

  /**
   * Checks if this workspace equals another workspace
   */
  equals(input: WorkspaceInput): boolean {
    if (FishWorkspace.is(input)) {
      return this.path === input.path;
    }

    const inputPath = extractPath(input);
    if (!inputPath) return false;

    const inputRoot = findWorkspaceRoot(inputPath);
    return inputRoot === this.path;
  }

  /**
   * Converts to VSCode WorkspaceFolder
   */
  toVSCodeWorkspaceFolder(): vscode.WorkspaceFolder {
    return {
      name: this.name,
      uri: this.uri,
      index: this.index
    };
  }

  /**
   * Converts to server workspace format
   */
  toServerWorkspace(): { readonly name: string; readonly uri: string; } {
    return {
      name: this.name,
      uri: this.uri.toString()
    };
  }

  /**
   * Returns a string representation
   */
  toString(): string {
    return `FishWorkspace(${this.name}, ${this.path})`;
  }

  /**
   * Creates a copy with new index
   */
  withIndex(index: number): FishWorkspace {
    return new FishWorkspace(this.name, this.uri, this.path, index);
  }
}

// Collection management class - also simplified
export class FishWorkspaceCollection {
  private readonly workspaces = new Map<string, FishWorkspace>();

  add(...input: (WorkspaceInput | undefined)[]): FishWorkspace | undefined {
    let firstWorkspace: FishWorkspace | undefined;
    const fixed = input.filter(item => !!item) as WorkspaceInput[];
    fixed.forEach((item, idx) => {
      const workspace = FishWorkspace.create(item, idx);
      if (workspace) {
        this.workspaces.set(workspace.path, workspace);
        if (!firstWorkspace) firstWorkspace = workspace;
      }
    });
    return firstWorkspace;
  }

  addInitial() {
    const current = this;
    return function () {
      const folders = vscode.workspace.workspaceFolders;
      if (folders) {
        folders.forEach(folder => {
          const workspace = FishWorkspace.create(folder);
          if (workspace && !current.has(workspace)) {
            current.add(workspace);
          }
        });
      }
      const currentDoc = vscode.window.activeTextEditor?.document;
      if (currentDoc) {
        const workspace = FishWorkspace.create(currentDoc);
        if (workspace && !current.has(workspace)) {
          current.add(currentDoc);
        }
      }
      return current.getAll();
    };
  }

  findContaining(input: WorkspaceInput): FishWorkspace | undefined {
    const inputPath = extractPath(input);
    if (!inputPath) return undefined;

    return Array.from(this.workspaces.values())
      .find(ws => workspaceContains(ws, inputPath));
  }

  get(input: WorkspaceInput): FishWorkspace | undefined {
    const path = extractPath(input);
    if (!path) return undefined;

    const root = findWorkspaceRoot(path);
    return root ? this.workspaces.get(root) : undefined;
  }

  has(input: WorkspaceInput): boolean {
    return this.get(input) !== undefined;
  }

  remove(input: WorkspaceInput): boolean {
    const workspace = this.get(input);
    return workspace ? this.workspaces.delete(workspace.path) : false;
  }

  getAll(): readonly FishWorkspace[] {
    return Array.from(this.workspaces.values());
  }

  clear(): void {
    this.workspaces.clear();
  }

  get size(): number {
    return this.workspaces.size;
  }

  *[Symbol.iterator](): IterableIterator<FishWorkspace> {
    yield* this.workspaces.values();
  }
}

// Export the pure functions for direct use when needed
export const WorkspaceUtils = {
  // Core workspace detection
  findWorkspaceRoot,
  isFishWorkspacePath,
  hasFishDirectories,
  hasConfigFile,

  // Path utilities
  extractPath,
  workspaceContains,
  createWorkspaceFromPath,

  // Constants
  FISH_DIRS,
  CONFIG_FILE
} as const;

// Usage examples:
/*
// Class-based API (clean and convenient)
const workspace = FishWorkspace.create('/home/user/.config/fish');
if (workspace?.contains('/home/user/.config/fish/functions/test.fish')) {
  console.log('Contains file!');
}

// Pure function API (when you need more control)
const root = WorkspaceUtils.findWorkspaceRoot('/home/user/.config/fish/functions/test.fish');
if (root && WorkspaceUtils.isFishWorkspacePath(root)) {
  console.log('Valid fish workspace:', root);
}

// Collection management
const collection = new FishWorkspaceCollection();
collection.add('/home/user/.config/fish');
const containing = collection.findContaining('/home/user/.config/fish/config.fish');
*/
export namespace Folders {

  export function fromCurrentDocument(): {
    document: vscode.TextDocument;
    workspaceRoot: string | undefined;
    fishWorkspace?: FishWorkspace;
    workspaceFolder?: vscode.WorkspaceFolder;
  } | undefined {
    const currentDoc = vscode.window.activeTextEditor?.document;
    if (!currentDoc) return undefined;

    return {
      document: currentDoc,
      workspaceRoot: findWorkspaceRoot(currentDoc.uri.fsPath),
      fishWorkspace: FishWorkspace.create(currentDoc),
      workspaceFolder: vscode.workspace.getWorkspaceFolder(currentDoc.uri)
    }
  }

  export function getVscodeFolders(): vscode.WorkspaceFolder[] {
    return vscode.workspace.workspaceFolders?.map(w => w) || [];
  }

  export async function fromEnv(env: NodeJS.ProcessEnv) : Promise<string[]> {
    const items = env['fish_lsp_all_indexed_paths']?.trim().split(' ') || ['__fish_config_dir', '__fish_data_dir'];
    const result = await Promise.all(items.map(async (item) => {
      const path = await getFishValue(item);
      if (path && PathUtils.isDirectory(path)) {
        return path;
      }
      return undefined;
    }))
    return result.filter((item): item is string => !!item && item?.trim() !== '');
  }

  export function allPaths(defaultPaths: string[]): string[] {
    const result: string[] = [];
    const openFolder = Folders.fromCurrentDocument();

    if (openFolder?.fishWorkspace) {
      result.push(openFolder.fishWorkspace.path);
    }

    const currentFolders = Folders.getVscodeFolders().map(folder => folder.uri.fsPath);
    for (const folder of currentFolders) {
      if (result.some(existing => existing === folder)) continue;
      result.push(folder);
    }

    for (const folder of defaultPaths) {
      if (result.some(existing => existing === folder)) continue;
      result.push(folder);
    }

    return result.filter((item, index) => item && item.trim() !== '' && result.indexOf(item) === index);
  }

  export function allFishWorkspaces(defaultPaths: string[]): FishWorkspace[] {
    const result: FishWorkspace[] = [];
    const openFolder = Folders.fromCurrentDocument();

    if (openFolder?.fishWorkspace) {
      result.push(openFolder.fishWorkspace);
    }

    const currentFolders = Folders.getVscodeFolders();
    for (const folder of currentFolders) {
      const workspace = FishWorkspace.create(folder);
      if (workspace && !result.some(existing => existing.equals(workspace))) {
        result.push(workspace);
      }
    }

    if (config.enableWorkspaceFolders) {
      for (const folder of defaultPaths) {
        const workspace = FishWorkspace.create(folder);
        if (workspace && !result.some(existing => existing.equals(workspace))) {
          result.push(workspace);
        }
      }
    }

    return result.reduce((acc: FishWorkspace[], workspace) => {
      if (!workspace) return acc;
      const curr = FishWorkspace.fromWorkspaceFolder(workspace);
      if (!acc.some(ws => ws.equals(curr))) {
        acc.push(curr);
      }
      return acc;
    }, []).map((ws, index) => ws.withIndex(index));
  }
}
