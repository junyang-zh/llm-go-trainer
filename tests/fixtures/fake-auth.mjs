// Authentication probe fixture: Codex logged in, Claude installed but logged out.
const args = process.argv.slice(2);
if (args.join(' ') === 'login status') {
  console.log('test-account-details');
  process.exit(0);
}
if (args.join(' ') === 'auth status') {
  console.log('test-account-details');
  process.exit(1);
}
process.exit(2);
