import generator from 'generate-password';
import fs from 'fs';

let secretsFilePath;

function initialize(_secretsFilePath) {
  secretsFilePath = _secretsFilePath;
}

function generatePassword() {
  return generator.generate({
    length: 16,
    numbers: true,
    symbols: true,
    uppercase: true,
    excludeSimilarCharacters: true,
    strict: true
  });
}

function savePassword(password, secrets) {
  const sanitized = password.replace(/\$/g, '$$$$');
  secrets.password = sanitized;
  const secretsText = fs.readFileSync(secretsFilePath, 'utf-8');
  fs.writeFileSync(secretsFilePath, secretsText.replace(/^(password:\s*).*$/m, '$1' + sanitized));
}

export { initialize, generatePassword, savePassword };