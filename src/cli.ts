#!/usr/bin/env node
import { Command } from 'commander';
import { runDel } from './commands/del';
import { runGet } from './commands/get';
import { type Prompter, runInit } from './commands/init';
import { formatList, runList } from './commands/list';
import { runSet } from './commands/set';

const program = new Command();

program
  .name('hidevars')
  .description('Manage project environment variables with at-rest encryption.')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize hidevars in the current project.')
  .action(async () => {
    const prompter = await buildPrompter();
    const result = await runInit({ prompter, log: write });
    if (result.createdProfile) {
      write(`Created profile "${result.profile}".`);
    }
  });

program
  .command('set <name> <value>')
  .description('Set or update a variable. Use NAME:p|m|o to choose display mode.')
  .action(async (name: string, value: string) => {
    const result = await runSet({ spec: name, value });
    write(`${result.created ? 'Created' : 'Updated'} ${result.name} (mode=${result.mode}).`);
  });

program
  .command('get <name>')
  .description('Print the decrypted plaintext value of a variable.')
  .action(async (name: string) => {
    const value = await runGet({ name });
    process.stdout.write(`${value}\n`);
  });

program
  .command('del <name>')
  .description('Delete a variable from .env.')
  .action(async (name: string) => {
    await runDel({ name });
    write(`Deleted ${name}.`);
  });

program
  .command('list')
  .description('List all variables, rendered per their display mode.')
  .action(async () => {
    const items = await runList();
    process.stdout.write(`${formatList(items)}\n`);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`hidevars: ${message}\n`);
  process.exit(1);
});

function write(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function buildPrompter(): Promise<Prompter> {
  const inquirer = (await import('@inquirer/prompts')) as {
    select: (opts: { message: string; choices: { name: string; value: unknown }[] }) => Promise<unknown>;
    input: (opts: { message: string; validate?: (v: string) => true | string }) => Promise<string>;
    password: (opts: { message: string; mask?: string; validate?: (v: string) => true | string }) => Promise<string>;
    confirm: (opts: { message: string; default?: boolean }) => Promise<boolean>;
  };

  return {
    pickOrCreateProfile: async (existing) => {
      const choice = await inquirer.select({
        message: 'Select a profile or create a new one:',
        choices: [
          ...existing.map((n) => ({ name: n, value: { kind: 'pick', name: n } })),
          { name: '+ Create new profile', value: { kind: 'create' } },
        ],
      });
      return choice as { kind: 'pick'; name: string } | { kind: 'create' };
    },
    newProfileName: async (existing) => {
      return inquirer.input({
        message: 'New profile name:',
        validate: (v) => {
          if (v.length === 0) return 'name required';
          if (existing.includes(v)) return `profile "${v}" already exists`;
          return true;
        },
      });
    },
    newPassphrase: async () => {
      const first = await inquirer.password({
        message: 'Passphrase:',
        mask: '*',
        validate: (v) => (v.length === 0 ? 'passphrase required' : true),
      });
      const second = await inquirer.password({ message: 'Confirm passphrase:', mask: '*' });
      if (first !== second) {
        throw new Error('passphrases did not match');
      }
      return first;
    },
    confirmSwitchProfile: async (currentName) => {
      return inquirer.confirm({
        message: `Project is already configured for profile "${currentName}". Switch to a different profile?`,
        default: false,
      });
    },
  };
}
