const fs = require('node:fs');
const lock = JSON.parse(fs.readFileSync('./package-lock.json', 'utf8'));
const pkgs = lock.packages || {};
let count = 0;
for (const [k, p] of Object.entries(pkgs)) {
  if (p.vulnerabilities) {
    count++;
    console.log(k, Object.keys(p.vulnerabilities));
  }
}
console.log("Total:", count);
