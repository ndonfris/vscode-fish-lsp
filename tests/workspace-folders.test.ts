import * as fs from 'fs';
import * as os from 'os';
import { FishClientWorkspace, FishUriWorkspace, PathUtils } from '../src/workspace';
import * as path from 'path';
import { getCommandFilePath } from '../src/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Uri, WorkspaceFolder } from 'vscode';

const execFileAsync = promisify(execFile);
let fishPath = 'fish';
const HOME_DIR = os.homedir();
let FISH_CONFIG_DIR = path.join(HOME_DIR, '.config', 'fish');
let FISH_DATA_DIR = path.join('/usr', 'share', 'fish');

const getFolderPathEscaped = async (folderPath: string): Promise<string | undefined> => {
  const path = await execFileAsync(fishPath, ['-c', `echo ${folderPath}`]);
  if (path.stdout) {
    const escapedPath = path.stdout.trim();
    if (!fs.existsSync(escapedPath)) {
      return undefined;
    }
    return escapedPath;
  }
  return undefined;
};

describe('workspace-folders', () => {

  beforeAll(async () => {
    FISH_CONFIG_DIR = await getFolderPathEscaped(`$__fish_config_dir`) || path.join(HOME_DIR, '.config', 'fish');
    FISH_DATA_DIR = await getFolderPathEscaped(`$__fish_data_dir`) || path.join('usr', 'share', 'fish');
  });

  beforeEach(() => {
    FishClientWorkspace.counter = 0;
  });

  describe('setup', () => {
    it('paths', () => {
      expect(FISH_CONFIG_DIR).toBeDefined();
      expect(FISH_DATA_DIR).toBeDefined();
      expect(fs.existsSync(FISH_CONFIG_DIR)).toBe(true);
      expect(FISH_CONFIG_DIR).toContain('.config/fish');
      expect(FISH_DATA_DIR).toContain('fish');
    });

    it('counter', () => {
      expect(FishClientWorkspace.counter).toBe(0);
    });
  });

  describe('namespace PathUtils', () => {

    it('isDirectory()', () => {
      expect(PathUtils.isDirectory(FISH_CONFIG_DIR)).toBe(true);
      expect(PathUtils.isDirectory(FISH_DATA_DIR)).toBe(true);
      expect(PathUtils.isDirectory(__dirname)).toBe(true);
    });

    it('isFile()', () => {
      expect(PathUtils.isFile(path.join(FISH_CONFIG_DIR, 'config.fish'))).toBe(true);
      expect(PathUtils.isFile(path.join(FISH_DATA_DIR, 'fishd.fish'))).toBe(false); // fishd.fish is a directory
      expect(PathUtils.isFile(__filename)).toBe(true);
    });

    it('hasFishChildFolder()', () => {
      expect(PathUtils.hasFishChildFolder(FISH_CONFIG_DIR)).toBe(true);
      expect(PathUtils.hasFishChildFolder(FISH_DATA_DIR)).toBe(true);
      expect(PathUtils.hasFishChildFolder('/tmp/test1')).toBe(false);
      expect(PathUtils.hasFishChildFolder('/tmp/test2')).toBe(false);
      expect(PathUtils.hasFishChildFolder(__dirname)).toBe(false);
    });

    it('exists()', () => {
      expect(PathUtils.exists(FISH_CONFIG_DIR)).toBe(true);
      expect(PathUtils.exists(FISH_DATA_DIR)).toBe(true);
      expect(PathUtils.exists(__filename)).toBe(true);
    });
  });

  describe('namespace FishUriWorkspace', () => {

    describe('isFishWorkspacePath()', () => {
      it('should return true for fish workspace paths', () => {
        expect(FishUriWorkspace.isFishWorkspacePath(`${os.homedir()}/.config/fish`)).toBeTruthy();
        expect(FishUriWorkspace.isFishWorkspacePath('/usr/share/fish')).toBeTruthy();
        expect(FishUriWorkspace.isFishWorkspacePath('/tmp/test1')).toBeFalsy();
      });

      it('should return false for non-fish workspace paths', () => {
        expect(FishUriWorkspace.isFishWorkspacePath(`${os.homedir()}/some_other_path`)).toBe(false);
        expect(FishUriWorkspace.isFishWorkspacePath('/tmp/test2/foo.txt')).toBe(false);
      });
    });

    describe('getWorkspaceRootFromUri()', () => {
      it('/usr/share/fish/functions -> /usr/share/fish', () => {
        const root = FishUriWorkspace.getWorkspaceRootFromUri(Uri.parse('/usr/share/fish/functions'));
        expect(root).toBeDefined();
        expect(root).toBe('/usr/share/fish');
      });

      it('/usr/share/fish/completions -> /usr/share/fish', () => {
        const root = FishUriWorkspace.getWorkspaceRootFromUri(Uri.parse('/usr/share/fish/completions'));
        expect(root).toBeDefined();
        expect(root).toBe('/usr/share/fish');
      });

      it('/usr/share/fish/conf.d -> /usr/share/fish', () => {
        const root = FishUriWorkspace.getWorkspaceRootFromUri(Uri.parse('/usr/share/fish/conf.d'));
        expect(root).toBeDefined();
        expect(root).toBe('/usr/share/fish');
      });

      it('/home/user/.config/fish -> /home/user/.config/fish', () => {
        const root = FishUriWorkspace.getWorkspaceRootFromUri(Uri.parse(`${os.homedir()}/.config/fish`));
        expect(root).toBeDefined();
        expect(root).toBe(`${os.homedir()}/.config/fish`);
      });

      it('~/.config/fish/functions -> /home/user/.config/fish', () => {
        const root = FishUriWorkspace.getWorkspaceRootFromUri(Uri.parse(`file://${os.homedir}/.config/fish/functions`));
        expect(root).toBeDefined();
        expect(root).toBe(`${os.homedir()}/.config/fish`);
      });

      it('/tmp/test1 -> /tmp/test1', () => {
        const root = FishUriWorkspace.getWorkspaceRootFromUri(Uri.parse('/tmp/test1'));
        expect(root).toBeDefined();
        expect(root).toBe('/tmp/test1');
      });


    });
  });

  describe('class FishClientWorkspace', () => {
    describe('createFromPath()', () => {

      it('create default workspaces', () => {
        const workspace1 = FishClientWorkspace.createFromPath(FISH_CONFIG_DIR);
        const workspace2 = FishClientWorkspace.createFromPath(FISH_DATA_DIR);

        expect(workspace1).toBeDefined();
        expect(workspace2).toBeDefined();
        expect(workspace1.uri.toString()).toBe(`file://${FISH_CONFIG_DIR}`);
        expect(workspace2.uri.toString()).toBe(`file://${FISH_DATA_DIR}`);
      });

    });

    describe('createFrom()', () => {
      const defaultWorkspaces = [
        FISH_CONFIG_DIR,
        FISH_DATA_DIR,
      ];
      let defaultFolders: WorkspaceFolder[] = [];
      beforeAll(async () => {
        defaultFolders = await Promise.all(defaultWorkspaces.map(async (val, idx) => {
          const path = await execFileAsync(fishPath, ['-c', `echo ${val}`]);
          if (path.stdout) {
            const escapedPath = path.stdout.trim();
            if (!fs.existsSync(escapedPath)) {
              return undefined;
            }
            const workspaceFolder: WorkspaceFolder = {
              uri: Uri.parse(escapedPath),
              name: val,
              index: idx,
            };
            return workspaceFolder;
          }
          return undefined;
        }).filter(ws => ws !== undefined) as Promise<WorkspaceFolder>[]);
      });

      it('create workspaces from shell values', async () => {
        defaultFolders.forEach((ws) => {
          const workspace = FishClientWorkspace.fromFolder(ws);
          expect(workspace).toBeDefined();
          expect(workspace.uri?.fsPath.toString()).toBe(ws.uri?.fsPath.toString());
          expect(workspace.name).toBe(ws.name);
          expect(workspace.index).toBe(ws.index);
        });
      });
    });

    describe('contains()', () => {

      describe('/tmp/test1 && /tmp/test2', () => {
        beforeAll(async () => {
          fs.mkdirSync('/tmp/test1');
          fs.writeFileSync('/tmp/test1/foo', 'test file');
          fs.mkdirSync('/tmp/test2');
        });

        afterAll(() => {
          fs.rmdirSync('/tmp/test1', { recursive: true });
          fs.rmdirSync('/tmp/test2', { recursive: true });
        });

        it('/tmp/test1 contains file:///tmp/test1/foo', () => {
          const workspace = FishClientWorkspace.createFromPath('/tmp/test1');
          expect(workspace.contains('/tmp/test1/foo')).toBeTruthy();
        });

        it('/tmp/test1 does not contain file:///tmp/test2/foo', () => {
          const workspace = FishClientWorkspace.createFromPath('/tmp/test1');
          expect(workspace.contains('/tmp/test2/foo')).toBeFalsy();
        });

        it('/tmp/test1 contains file:///tmp/test1', () => {
          const workspace1 = FishClientWorkspace.createFromPath('/tmp/test1');
          const workspace2 = FishClientWorkspace.createFromPath('/tmp/test2');
          expect(workspace1.contains(workspace2.uri)).toBeFalsy();
          expect(workspace2.contains(workspace1.uri)).toBeFalsy();
        });
      });

      describe('$__fish_config_dir', () => {
        it('$__fish_config_dir contains file://$__fish_config_dir/config.fish', () => {
          const workspace = FishClientWorkspace.createFromPath(FISH_CONFIG_DIR);
          expect(workspace.contains(path.join(FISH_CONFIG_DIR, 'config.fish'))).toBeTruthy();
          expect(workspace.contains(FISH_DATA_DIR)).toBeFalsy();
        });
      });

      describe('$__fish_data_dir', () => {
        it('$__fish_data_dir contains file://$__fish_data_dir/config.fish', () => {
          const workspace = FishClientWorkspace.createFromPath(FISH_DATA_DIR);
          expect(workspace.contains(path.join(FISH_DATA_DIR, 'config.fish'))).toBeTruthy();
          expect(workspace.contains(FISH_CONFIG_DIR)).toBeFalsy();
        });
        it('$__fish_data_dir contains file://$__fish_data_dir/{functions,completions}/fish_add_path.fish', () => {
          const workspace = FishClientWorkspace.createFromPath(FISH_DATA_DIR);
          expect(workspace.contains(path.join(FISH_DATA_DIR, 'functions', 'fish_add_path.fish'))).toBeTruthy();
          expect(workspace.contains(path.join(FISH_DATA_DIR, 'completions', 'fish_add_path.fish'))).toBeTruthy();
        });
      });

    });

    describe('onDidOpenTextDocument()', () => {

      it('with default folders initialized', async () => {
        const defaultWorkspaces = [
          FISH_CONFIG_DIR,
          FISH_DATA_DIR,
        ];
        const defaultFolders: WorkspaceFolder[] = await Promise.all(defaultWorkspaces.map(async (val, idx) => {
          const path = await execFileAsync(fishPath, ['-c', `echo ${val}`]);
          if (path.stdout) {
            const escapedPath = path.stdout.trim();
            if (!fs.existsSync(escapedPath)) {
              return undefined;
            }
            const workspaceFolder: WorkspaceFolder = {
              uri: Uri.parse(escapedPath),
              name: val,
              index: idx,
            };
            return workspaceFolder;
          }
          return undefined;
        }).filter(ws => ws !== undefined) as Promise<WorkspaceFolder>[]);

        const allFolders: FishClientWorkspace[] = [];
        defaultFolders.forEach((ws) => {
          const workspace = FishClientWorkspace.fromFolder(ws);
          expect(workspace).toBeDefined();
          allFolders.push(workspace);
        });
        expect(allFolders).toHaveLength(2);

        // create a new file uri like the request implies,
        // then check if there is an existing folder that contains this file
        const newFileUri = Uri.file(path.join(FISH_CONFIG_DIR, 'new_file.fish'));
        const newFileFolder = FishClientWorkspace.createFromPath(newFileUri.fsPath);
        expect(newFileFolder).toBeDefined();
        const foundFolder = allFolders.find(folder => folder.contains(newFileUri));
        expect(foundFolder).toBeDefined();
        console.log({
          newFileUri: newFileUri.toString(),
          foundFolder: foundFolder?.uri.toString(),
          allFolders: allFolders.map(folder => folder.uri.toString())
        })

      });

      it("with no open documents", () => {
        const allFolders: FishClientWorkspace[] = [];

        const fileUri = Uri.file(path.join(FISH_CONFIG_DIR, 'config.fish'));
        const foundFolder = allFolders.find(ws => ws.contains(fileUri));
        expect(foundFolder).toBeUndefined();
        if (foundFolder) {
          console.log(`Found folder: ${foundFolder.uri.toString()}`);
        } else {
          const newFolder = FishClientWorkspace.createFromPath(fileUri.fsPath);
          allFolders.push(newFolder);
        }

        expect(allFolders).toHaveLength(1);
        console.log({
          fileUri: fileUri.toString(),
          allFolders: allFolders.map(folder => ({name: folder.name, uri: folder.uri.toString()}))
        })
          
      });

    });

    describe('event testing', () => {
      it("added 1, removed 1", () => {
        const added = [{
          name: 'test',
          uri: 'file:///test'
        }];
        const removed = [{
          name: 'test',
          uri: 'file:///test/foo'
        }];

        const event = {
          added,
          removed
        };


        const resultEvent = FishClientWorkspace.fromEvent(event);

        expect(resultEvent.added.length).toBe(1);
        expect(resultEvent.removed.length).toBe(1);
        expect(event.added.length).toBe(1);
        expect(event.removed.length).toBe(1);
      });

    });
  });

});
