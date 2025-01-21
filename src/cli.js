#!/usr/bin/env node
const { Command } = require('commander');
const { createFolder, decryptFolder, closeDecryptedFolder } = require('./operations');
const program = new Command();

program
  .name('secure-folder-cli')
  .description('CLI tool for encrypting/decrypting folders')
  .version('1.0.0');

// Command to create an encrypted folder
program
  .command('create <folderPath>')
  .description('Create an encrypted folder')
  .action(folderPath => {
    createFolder(folderPath);
  });

// Command to decrypt an encrypted folder
program
  .command('open <folderPath>')
  .description('Decrypt an encrypted folder temporarily')
  .action(folderPath => {
    decryptFolder(folderPath);
  });

// Command to close (re-encrypt) a decrypted folder
program
  .command('close <folderPath>')
  .description('Re-encrypt and clean up the decrypted folder')
  .action(folderPath => {
    closeDecryptedFolder(folderPath);
  });

program.parse(process.argv);
