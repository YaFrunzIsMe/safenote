const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');

const algorithm = 'aes-256-cbc';
const keyLength = 32;
const ivLength = 16;

const FILENAME_IV = Buffer.alloc(16, 0); // Consistent IV for filenames

// Generate a key for encryption
function generateKey(password) {
  return crypto.scryptSync(password, 'salt', keyLength);
}

// Encrypt a file
function encryptFile(filePath, outputPath, key) {
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const input = fs.readFileSync(filePath);
  
  const encrypted = Buffer.concat([iv, cipher.update(input), cipher.final()]);
  fs.writeFileSync(outputPath, encrypted);
}

// Decrypt a file
function decryptFile(filePath, outputPath, key) {
  const data = fs.readFileSync(filePath);
  const iv = data.slice(0, ivLength);
  const encryptedData = data.slice(ivLength);
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  fs.writeFileSync(outputPath, decrypted);
}

// Encrypt folder
async function createFolder(folderPath) {
  // Create source folder if it doesn't exist
  fs.ensureDirSync(folderPath);

  const password = await promptPassword();
  const key = generateKey(password);

  const files = fs.readdirSync(folderPath);
  for (const file of files) {
    const originalFilePath = path.join(folderPath, file);
    const encryptedFilePath = path.join(folderPath, encryptFileName(file, key));

    if (originalFilePath !== encryptedFilePath) {
      encryptFile(originalFilePath, encryptedFilePath, key);
      fs.removeSync(originalFilePath);
    }
  }

  console.log('Folder encrypted successfully.');
}

// Validate password by trying to decrypt a filename
function validatePassword(password, encryptedFolder) {
  try {
    const key = generateKey(password);
    const files = fs.readdirSync(encryptedFolder);
    if (files.length === 0) {
      return true; // Empty folder is valid
    }
    
    // Try to decrypt the first filename as a test
    const decryptedName = decryptFileName(files[0], key);
    
    // Basic validation that the decrypted name looks reasonable
    if (!decryptedName || decryptedName.includes('\0')) {
      throw new Error('Incorrect password');
    }
    
    return true;
  } catch (error) {
    throw new Error('Incorrect password');
  }
}

// Decrypt folder temporarily
async function decryptFolder(folderPath) {
  if (!fs.existsSync(folderPath)) {
    throw new Error(`Encrypted folder '${folderPath}' does not exist`);
  }

  const decryptPath = folderPath + '_decrypt';
  if (fs.existsSync(decryptPath)) {
    console.error('Error: Folder is already decrypted. Please close it first before opening again.');
    process.exit(1);
  }

  try {
    const password = await promptPassword();
    
    // Validate password before creating decrypt folder
    validatePassword(password, folderPath);
    
    const key = generateKey(password);
    
    fs.ensureDirSync(decryptPath);

    // Helper function to process directories recursively
    const processDirectory = (currentPath, targetPath) => {
      const files = fs.readdirSync(currentPath);
      
      for (const file of files) {
        const sourcePath = path.join(currentPath, file);
        const stats = fs.statSync(sourcePath);
        
        if (stats.isDirectory()) {
          // Create corresponding directory in target
          const targetDir = path.join(targetPath, decryptFileName(file, key));
          fs.ensureDirSync(targetDir);
          // Recursively process subdirectory
          processDirectory(sourcePath, targetDir);
        } else {
          // Decrypt and copy file
          const targetFilePath = path.join(targetPath, decryptFileName(file, key));
          decryptFile(sourcePath, targetFilePath, key);
        }
      }
    };

    // Start processing from root directory
    processDirectory(folderPath, decryptPath);

    console.log(`Folder decrypted to: ${decryptPath}`);
  } catch (error) {
    // Clean up the decrypt folder if it was created
    if (fs.existsSync(decryptPath)) {
      fs.removeSync(decryptPath);
    }
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Close decrypted folder
async function closeDecryptedFolder(folderPath) {
  const decryptPath = folderPath + '_decrypt';
  if (!fs.existsSync(decryptPath)) {
    throw new Error(`Decrypted folder '${decryptPath}' does not exist`);
  }

  const password = await promptPassword();
  
  try {
    // Validate password before proceeding
    validatePassword(password, folderPath);
    
    const key = generateKey(password);

    // Clear the original encrypted folder
    fs.emptyDirSync(folderPath);

    // Helper function to process directories recursively
    const processDirectory = (currentPath, targetPath) => {
      const files = fs.readdirSync(currentPath);
      
      for (const file of files) {
        const sourcePath = path.join(currentPath, file);
        const stats = fs.statSync(sourcePath);
        
        if (stats.isDirectory()) {
          // Create corresponding directory in target
          const targetDir = path.join(targetPath, encryptFileName(file, key));
          fs.ensureDirSync(targetDir);
          // Recursively process subdirectory
          processDirectory(sourcePath, targetDir);
        } else {
          // Encrypt and copy file
          const targetFilePath = path.join(targetPath, encryptFileName(file, key));
          encryptFile(sourcePath, targetFilePath, key);
        }
      }
    };

    // Start processing from root directory
    processDirectory(decryptPath, folderPath);

    fs.removeSync(decryptPath);
    console.log('Decrypted folder closed and encrypted.');
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Utility functions for file name encryption
function encryptFileName(fileName, key) {
  const cipher = crypto.createCipheriv(algorithm, key, FILENAME_IV);
  return cipher.update(fileName, 'utf8', 'hex') + cipher.final('hex');
}

function decryptFileName(encryptedName, key) {
  const decipher = crypto.createDecipheriv(algorithm, key, FILENAME_IV);
  return decipher.update(encryptedName, 'hex', 'utf8') + decipher.final('utf8');
}

// Prompt for password securely
function promptPassword() {
  return new Promise((resolve, reject) => {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    let isReading = true;
    
    // Hide input while typing
    const dataHandler = chunk => {
      if (isReading) {
        process.stdout.write('\u001B[2K\u001B[200D' + '*'.repeat(chunk.length));
      }
    };
    
    process.stdin.on('data', dataHandler);
    
    rl.question('Enter password: ', (password) => {
      isReading = false;
      process.stdin.removeListener('data', dataHandler);
      rl.close();
      resolve(password);
    });

    rl.on('error', (err) => {
      isReading = false;
      process.stdin.removeListener('data', dataHandler);
      rl.close();
      reject(err);
    });
  });
}

module.exports = { createFolder, decryptFolder, closeDecryptedFolder };
