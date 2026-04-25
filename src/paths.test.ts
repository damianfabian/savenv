import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { profilesDir, profilesFile } from './paths';

describe('paths.profilesDir', () => {
  it('uses XDG_CONFIG_HOME on POSIX when set', () => {
    expect(
      profilesDir({
        platform: 'linux',
        env: { XDG_CONFIG_HOME: '/custom/xdg' },
        homedir: () => '/home/u',
      }),
    ).toBe(path.join('/custom/xdg', 'envsafe'));
  });

  it('falls back to ~/.config on POSIX without XDG_CONFIG_HOME', () => {
    expect(
      profilesDir({ platform: 'linux', env: {}, homedir: () => '/home/u' }),
    ).toBe(path.join('/home/u', '.config', 'envsafe'));
  });

  it('uses APPDATA on Windows when set', () => {
    expect(
      profilesDir({
        platform: 'win32',
        env: { APPDATA: 'C:\\Users\\u\\AppData\\Roaming' },
        homedir: () => 'C:\\Users\\u',
      }),
    ).toBe(path.join('C:\\Users\\u\\AppData\\Roaming', 'envsafe'));
  });

  it('falls back to %USERPROFILE%/AppData/Roaming on Windows', () => {
    expect(
      profilesDir({
        platform: 'win32',
        env: {},
        homedir: () => 'C:\\Users\\u',
      }),
    ).toBe(path.join('C:\\Users\\u', 'AppData', 'Roaming', 'envsafe'));
  });

  it('treats empty XDG_CONFIG_HOME as unset', () => {
    expect(
      profilesDir({ platform: 'darwin', env: { XDG_CONFIG_HOME: '' }, homedir: () => '/Users/u' }),
    ).toBe(path.join('/Users/u', '.config', 'envsafe'));
  });
});

describe('paths.profilesFile', () => {
  it('appends profiles.json to the directory', () => {
    expect(
      profilesFile({ platform: 'linux', env: {}, homedir: () => '/home/u' }),
    ).toBe(path.join('/home/u', '.config', 'envsafe', 'profiles.json'));
  });
});
