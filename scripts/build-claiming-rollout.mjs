// Mechanical, reviewable rollout overlay: preserve live legacy/support behavior.
import { readFile, writeFile } from 'node:fs/promises';
const baseline = 'backups/aquarium1-rules-1793885457188/firestore.rules';
let source = (await readFile(baseline, 'utf8')).replace(/\r\n/g, '\n');
const current = (await readFile('firestore.rules', 'utf8')).replace(/\r\n/g, '\n');
function functions(text) {
  const starts = [...text.matchAll(/^    function (\w+)\(/gm)];
  return new Map(starts.map((match, index) => {
    const end = starts[index + 1]?.index ?? text.indexOf('\n    match ', match.index);
    return [match[1], text.slice(match.index, end).trimEnd()];
  }));
}
const oldFns = functions(source), newFns = functions(current);
function replaceOnce(before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before))
    throw new Error('Unexpected baseline shape; stop and review');
  source = source.replace(before, after);
}
replaceOnce(oldFns.get('hasProtectedAccess'), newFns.get('hasProtectedAccess') + '\n\n' + newFns.get('aquariumAccessOpen'));
replaceOnce(oldFns.get('ownsAquarium'), newFns.get('ownsAquarium'));

// Only device-claimed profiles use current schema validation. Legacy profiles
// retain their deployed validators, including their existing delete behavior.
const profileNames = new Set([...newFns.keys()].filter(name =>
  current.indexOf(newFns.get(name)) >= current.indexOf('    function userAquariumUpdateFields(')));
const selected = new Set();
function select(name) {
  if (selected.has(name)) return;
  selected.add(name);
  for (const dependency of profileNames)
    if (new RegExp(`\\b${dependency}\\(`).test(newFns.get(name)) && dependency !== name) select(dependency);
}
select('validUserAquariumUpdate');
select('aquariumDirectoryMatchesSource');
let additions = [...selected].map(name => newFns.get(name)).join('\n\n');
for (const name of selected) additions = additions.replace(new RegExp(`\\b${name}\\(`, 'g'), `claimed_${name}(`);
replaceOnce(oldFns.get('validUserAquariumUpdate'), oldFns.get('validUserAquariumUpdate').replace('function validUserAquariumUpdate(', 'function legacyUserAquariumUpdate('));
replaceOnce(oldFns.get('aquariumDirectoryMatchesSource'), oldFns.get('aquariumDirectoryMatchesSource').replace('function aquariumDirectoryMatchesSource(', 'function legacyDirectoryMatchesSource('));
const dispatch = `
    function deviceClaimed(data) {
      return data.get('deviceId', '') != '' && data.get('deviceUid', '') != '';
    }

    function validUserAquariumUpdate() {
      return deviceClaimed(resource.data)
        ? claimed_validUserAquariumUpdate() : legacyUserAquariumUpdate();
    }

    function aquariumDirectoryMatchesSource(aquariumId) {
      let aquarium = getAfter(/databases/$(database)/documents/aquariums/$(aquariumId)).data;
      return deviceClaimed(aquarium)
        ? claimed_aquariumDirectoryMatchesSource(aquariumId) : legacyDirectoryMatchesSource(aquariumId);
    }
`;
replaceOnce('    match /users/{uid} {', `${additions}\n${dispatch}\n    match /users/{uid} {`);
replaceOnce(`      allow create: if hasProtectedAccess()
        && !isAdmin()
        && request.resource.data.ownerId == request.auth.uid
        && validAquariumCreate(userAquariumCreateFields())
        && aquariumDirectoryMatchesSource(aquariumId);`,
  '      // Device registration is required; only the trusted claiming endpoint creates profiles.\n      allow create: if false;');
replaceOnce(`      allow read: if hasProtectedAccess()
        && !isAdmin()
        && resource.data.ownerId == request.auth.uid;`, `      allow get: if hasProtectedAccess()
        && !isAdmin() && aquariumAccessOpen(aquariumId)
        && resource.data.ownerId == request.auth.uid;
      allow list: if hasProtectedAccess() && !isAdmin()
        && resource.data.ownerId == request.auth.uid;`);
replaceOnce(`        && validUserAquariumUpdate()`, `        && aquariumAccessOpen(aquariumId)
        && validUserAquariumUpdate()`);
replaceOnce(`        || (hasProtectedAccess() && resource.data.ownerId == request.auth.uid);`,
  `        || (hasProtectedAccess() && aquariumAccessOpen(aquariumId)
          && resource.data.ownerId == request.auth.uid);`);
// Scope the added directory access check to directory writes.
const directoryStart = source.indexOf('    match /aquarium_directory/');
const directoryEnd = source.indexOf('\n    match ', directoryStart + 10);
let directory = source.slice(directoryStart, directoryEnd);
directory = directory.replaceAll('&& !isAdmin()', '&& !isAdmin() && aquariumAccessOpen(aquariumId)');
directory = directory.replace('allow delete: if hasProtectedAccess()',
  `allow delete: if !deviceClaimed(get(/databases/$(database)/documents/aquariums/$(aquariumId)).data)
        && hasProtectedAccess()`);
source = source.slice(0, directoryStart) + directory + source.slice(directoryEnd);
replaceOnce(`      allow delete: if hasProtectedAccess()
        && !isAdmin()
        && resource.data.ownerId == request.auth.uid`,
  `      allow delete: if !deviceClaimed(resource.data)
        && hasProtectedAccess() && aquariumAccessOpen(aquariumId)
        && !isAdmin()
        && resource.data.ownerId == request.auth.uid`);
replaceOnce('    match /{document=**} {', `    match /authorization_user_policies/{uid} {
      allow get: if isSignedIn() && request.auth.uid == uid;
      allow list, create, update, delete: if false;
    }

    match /{document=**} {`);
await writeFile('firestore.claiming.rules', source);
console.log('Built focused claiming rules from saved live baseline. No deployment performed.');
