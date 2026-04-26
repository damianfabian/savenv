/**
 * Integration fixture: real-world Node.js usage of hidevars.
 *
 * Reads the project .env (mix of plain + hidevars('...') values) via the
 * default load() entry point, then prints the resolved values as JSON so the
 * integration test can assert on them.
 *
 * The integration test redirects XDG_CONFIG_HOME to a temp dir before
 * spawning this script, so the global profile lookup hits the seeded fixture
 * profile rather than the real user's profiles.json.
 */
const hidevars = require('hidevars');

(async () => {
  const result = await hidevars.load();
  const out = {
    loaded: result.loaded,
    failed: result.failed,
    values: {
      API_KEY: process.env.API_KEY,
      DATABASE_URL: process.env.DATABASE_URL,
      PUBLIC_NAME: process.env.PUBLIC_NAME,
    },
  };
  process.stdout.write(JSON.stringify(out));
})().catch((err) => {
  process.stderr.write(`fixture error: ${err.stack || err.message || err}\n`);
  process.exit(1);
});
