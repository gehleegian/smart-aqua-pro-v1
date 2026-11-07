import { readFile } from 'node:fs/promises';
const source = await readFile('C:/Users/marin/firebase-private/aquarium1-firmware-secrets.h', 'utf8');
for (const field of ['WIFI_SSID', 'WIFI_PASSWORD']) {
  const line = source.split(/\r?\n/).find(value => value.includes(field)) || '';
  const rhs = line.slice(line.indexOf('=') + 1).trim();
  console.log(JSON.stringify({ field, found: Boolean(line),
    standardDeclaration: new RegExp(`constexpr\\s+char\\s+${field}\\s*\\[\\s*\\]\\s*=`).test(line),
    nonemptyBrackets: new RegExp(`${field}\\s*\\[\\s*[^\\]\\s]+`).test(line),
    endsWithSemicolon: rhs.endsWith(';'),
    startsWithDoubleQuote: rhs.startsWith('"'),
    startsWithSmartQuote: /^[\u201c\u201d]/.test(rhs),
    startsWithSingleQuote: rhs.startsWith("'"),
    emptyValue: /^""\s*;?$/.test(rhs),
  }));
}
