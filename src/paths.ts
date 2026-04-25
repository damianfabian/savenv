import os from 'node:os';
import path from 'node:path';

const APP_DIR_NAME = 'hidevars';
const PROFILES_FILE_NAME = 'profiles.json';

export interface PathsEnv {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
}

export function profilesDir(deps: PathsEnv = {}): string {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const homedir = deps.homedir ?? os.homedir;

  if (platform === 'win32') {
    const appData = env.APPDATA;
    if (appData && appData.length > 0) {
      return path.join(appData, APP_DIR_NAME);
    }
    return path.join(homedir(), 'AppData', 'Roaming', APP_DIR_NAME);
  }

  const xdg = env.XDG_CONFIG_HOME;
  if (xdg && xdg.length > 0) {
    return path.join(xdg, APP_DIR_NAME);
  }
  return path.join(homedir(), '.config', APP_DIR_NAME);
}

export function profilesFile(deps: PathsEnv = {}): string {
  return path.join(profilesDir(deps), PROFILES_FILE_NAME);
}

export const PROJECT_ENV_FILE = '.env';
export const PROJECT_ENV_BACKUP_FILE = '.env.bak';
export const PROJECT_hidevars_FILE = '.hidevars';
export const PROJECT_GITIGNORE_FILE = '.gitignore';
