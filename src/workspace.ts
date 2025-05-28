import * as fs from 'fs';
import { basename, dirname, join } from 'path';
import * as LSP from 'vscode-languageclient';
import { Uri, WorkspaceFolder } from 'vscode';

export interface FishUriWorkspace {
  name: string;
  uri: string;
  path: string;
}

export namespace FishUriWorkspace {

  /** special location names */
  const FISH_DIRS = ['functions', 'completions', 'conf.d'];
  const CONFIG_FILE = 'config.fish';

  export function isTmpWorkspace(uri: string) {
    const path = Uri.parse(uri).fsPath;
    return path.startsWith('/tmp');
  }

  export function isFishWorkspacePath(path: string): boolean {
    if (PathUtils.hasFishChildFolder(path)) {
      return PathUtils.isDirectory(path);
    }
    // if (basename(path) === CONFIG_FILE && PathUtils.isFile(path)) {
    //   return true;
    // }
    return false;
  }


  /**
   * Removes file path component from a fish file URI unless it's config.fish
   */
  export function trimFishFilePath(uri: Uri): string | undefined {
    const path = uri.fsPath;
    if (!path) return undefined;

    const base = basename(path);
    if (base === CONFIG_FILE || path.startsWith('/tmp')) return path;
    return !PathUtils.isDirectory(path) && base.endsWith('.fish') ? dirname(path) : path;
  }

  /**
   * Gets the workspace root directory from a URI
   */
  export function getWorkspaceRootFromUri(uri: Uri): string | undefined {
    const path = uri.fsPath;
    if (!path) return undefined;

    let current = path;
    const base = basename(current);

    if (current.startsWith('/tmp')) {
      return current;
    }

    // check if the path is a fish workspace
    // (i.e., `~/.config/fish`, `/usr/share/fish`, `~/some_plugin`)
    if (PathUtils.isDirectory(current) && isFishWorkspacePath(current)) {
      if (base !== CONFIG_FILE) {
        return current;
      }
    }

    // If path is a fish directory or config.fish, return parent
    // Check if the parent is a fish directory or the current is config.fish
    // (i.e., `~/.config/fish/{functions,conf.d,completions}`, `~/.config/fish/config.fish`)
    if (FISH_DIRS.includes(base) || base === CONFIG_FILE) {
      return dirname(current);
    }

    // If a single workspace is supported is true, return the path
    // if (config.fish_lsp_single_workspace_support) {
    //   const indexedPath = config.fish_lsp_all_indexed_paths.find(p => path.startsWith(p));
    //   if (indexedPath) return indexedPath;
    //   return path;
    // }

    // Walk up looking for fish workspace indicators
    while (current !== dirname(current)) {
      // Check for fish dirs in current directory
      for (const dir of FISH_DIRS) {
        if (basename(current) === dir) {
          return dirname(current);
        }
      }

      // Check for config.fish or fish dirs as children
      if (
        // PathUtils.hasFishChildFolder(current)) {
        FISH_DIRS.some(dir => isFishWorkspacePath(join(current, dir))) ||
        PathUtils.exists(join(current, CONFIG_FILE))) {
        return current;
      }

      current = dirname(current);
    }

    return undefined;
  }
}

export namespace PathUtils {

  export function isDirectory(filepath: string): boolean {
    try {
      const fileStat = fs.statSync(filepath);
      return fileStat.isDirectory();
    } catch (_) {
      return false;
    }

  }

  export function isFile(filepath: string): boolean {
    try {
      const fileStat = fs.statSync(filepath);
      return fileStat.isFile();
    } catch (_) {
      return false;
    }
  }

  export function exists(filepath: string): boolean {
    try {
      return fs.existsSync(filepath);
    } catch (_) {
      return false;
    }
  }

  export function hasFishChildFolder(dir: string): boolean {
    if (!isDirectory(dir)) return false;
    return exists(join(dir, 'functions')) ||
      exists(join(dir, 'completions')) ||
      exists(join(dir, 'conf.d'));
  }
}

export namespace TranslationUtils {

  export type FishPath = {
    path: string;
    uri: Uri;
    type: 'file' | 'directory' | undefined;
  };

  export function getFishPathType(filepath: string | Uri | undefined): 'file' | 'directory' | undefined {
    if (!filepath) return undefined;
    if (typeof filepath === 'string') {
      const uri = Uri.parse(filepath);
      return PathUtils.isDirectory(uri.fsPath) ? 'directory' : 'file';
    }
    if (filepath instanceof Uri) {
      return PathUtils.isDirectory(filepath.fsPath) ? 'directory' : 'file';
    }
    return undefined;
  }

  export function translatePathlikeToFishPath(filepath: string | Uri | undefined): string | undefined {
    if (!filepath) return undefined;
    if (typeof filepath === 'string') {
      return FishUriWorkspace.trimFishFilePath(Uri.parse(filepath));
    }
    if (filepath instanceof Uri) {
      return FishUriWorkspace.trimFishFilePath(filepath);
    }
    return undefined;
  }

  export function fromPathlike(filepath: string | Uri | undefined): FishPath | undefined {
    const path = translatePathlikeToFishPath(filepath);
    if (!path) return undefined;
    return {
      path,
      uri: Uri.parse(path),
      type: getFishPathType(filepath)
    };
  }
}
export type ServerWorkspaceFolderParam = {
  readonly name: string;
  readonly uri: string;
};

export class FishClientWorkspace implements WorkspaceFolder {

  public static counter = 0;

  private constructor(
    public readonly name: string,
    public readonly uri: Uri,
    public readonly path: string,
    public readonly index: number = FishClientWorkspace.counter++
  ) {
    FishClientWorkspace.counter = Math.max(FishClientWorkspace.counter, this.index);
  }

  contains(filepathOrUri: Uri): boolean;
  contains(filepathOrUri: string): boolean;
  contains(filepathOrUri: Uri | string): boolean;
  contains(filepathOrUri: Uri | string): boolean {
    // let fileRoot: string | undefined;
    // if (typeof filepathOrUri === 'string') {
    //   fileRoot = FishUriWorkspace.getWorkspaceRootFromUri(Uri.parse(filepathOrUri))
    //   console.log({
    //     filepathOrUri,
    //     fileRoot,
    //     workspacePath: this.path
    //   })
    //   if (!fileRoot) return false;
    //   return fileRoot.startsWith(this.path)
    // }
    // if (filepathOrUri instanceof Uri) {
    //   fileRoot = FishUriWorkspace.getWorkspaceRootFromUri(filepathOrUri);
    //   return this.path === FishUriWorkspace.getWorkspaceRootFromUri(filepathOrUri);
    // }
    const fishPath = TranslationUtils.fromPathlike(filepathOrUri);
    if (!fishPath) return false;
    const fileRoot = FishUriWorkspace.getWorkspaceRootFromUri(fishPath.uri);
    if (!fileRoot) return false;
    return fileRoot.startsWith(this.path);
  }

  static createFromPath(dirpath: string, index: number = FishClientWorkspace.counter): FishClientWorkspace {
    const fishWorkspaceRoot = FishUriWorkspace.getWorkspaceRootFromUri(Uri.file(dirpath));
    if (!fishWorkspaceRoot) {
      throw new Error(`Cannot create FishClientWorkspace from path: ${dirpath}`);
    }
    return new FishClientWorkspace(fishWorkspaceRoot, Uri.file(fishWorkspaceRoot), fishWorkspaceRoot, index);
  }

  static createFromWorkspaceFolder(workspaceFolder: LSP.WorkspaceFolder): FishClientWorkspace {
    const uri = Uri.parse(workspaceFolder.uri);
    return new FishClientWorkspace(
      workspaceFolder.name,
      uri,
      uri.fsPath,
    );
  }

  // public static async createFromShellValue(shellValue: string, index: number = FishClientWorkspace.counter): Promise<FishClientWorkspace> {
  //   const output = 
  //   
  // }

  toServerWorkspace(): ServerWorkspaceFolderParam {
    return {
      name: this.name,
      uri: this.uri.toString()
    } as { readonly name: string; readonly uri: string; };
  }


  static fromFolder(folder: WorkspaceFolder): FishClientWorkspace;
  static fromFolder(folder: LSP.WorkspaceFolder): FishClientWorkspace;
  static fromFolder(folder: WorkspaceFolder | LSP.WorkspaceFolder): FishClientWorkspace;
  static fromFolder(folder: WorkspaceFolder | LSP.WorkspaceFolder): FishClientWorkspace {
    if (LSP.WorkspaceFolder.is(folder)) {
      return FishClientWorkspace.createFromWorkspaceFolder(folder);
    }
    if (!!folder && folder.uri) {
      return new FishClientWorkspace(
        folder?.name || folder?.uri.fsPath.toString(),
        folder.uri,
        folder.uri.fsPath,
        folder.index
      );
    }
    return new FishClientWorkspace(
      folder?.name || folder?.uri.fsPath.toString(),
      folder?.uri,
      folder?.uri.fsPath,
      folder?.index
    );
  }

  static fromEvent(event: LSP.WorkspaceFoldersChangeEvent): {
    added: ServerWorkspaceFolderParam[];
    removed: ServerWorkspaceFolderParam[];
  } {
    return {
      added: event.added.map(folder => FishClientWorkspace.fromFolder(folder).toServerWorkspace()),
      removed: event.removed.map(folder => FishClientWorkspace.fromFolder(folder).toServerWorkspace()),
    };
  }

  toWorkspaceFolder(): WorkspaceFolder {
    return {
      name: this.name,
      uri: this.uri,
      index: this.index,
    };
  }
}
