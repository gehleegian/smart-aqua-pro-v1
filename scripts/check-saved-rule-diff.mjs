import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
const folder = process.argv[2];
if (!/^backups\/aquarium1-rules-[0-9]+$/.test(folder || '')) throw new Error('Provide a saved rules backup folder');
const saved = JSON.parse(await readFile(`${folder}/database.rules.json`, 'utf8'));
const local = JSON.parse(await readFile('database.rules.json', 'utf8'));
console.log('RTDB rules structurally identical (ignoring key order):', isDeepStrictEqual(saved, local));
