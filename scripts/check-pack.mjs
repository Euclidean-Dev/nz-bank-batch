import { execSync } from 'node:child_process';

const output = execSync('npm pack --dry-run --json', {
  encoding: 'utf8'
});

const parsed = JSON.parse(output);
const packResult = Array.isArray(parsed) ? parsed[0] : parsed;
const files = packResult.files.map((entry) => entry.path).sort();
const disallowed = files.filter((file) =>
  /^(test|test-d|coverage|\.github|scripts|eslint\.config\.js|vitest\.config\.ts|tsconfig\.json|tsd\.json)/.test(
    file
  )
);

console.log('Pack contents:');
for (const file of files) {
  console.log(` - ${file}`);
}

if (disallowed.length > 0) {
  console.error('\nUnexpected files in npm pack output:');
  for (const file of disallowed) {
    console.error(` - ${file}`);
  }
  process.exit(1);
}
