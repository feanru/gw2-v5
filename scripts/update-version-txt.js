const { writeFileSync } = require('fs');
const { version } = require('../package.json');
writeFileSync('version.txt', `${version}\n`);
console.log(version);
