import {isAbsolute} from 'node:path';
import {enqueueFixture,fixtureStatus,runNextFixtureBuild} from './fixture-build-queue.ts';

async function main() {
  const [command,key] = process.argv.slice(2);
  const {PGHOST, PGPORT} = process.env;
  if (!PGHOST || !isAbsolute(PGHOST) || !PGPORT || !/^[0-9]{1,5}$/.test(PGPORT)) {
    throw new Error('Set PGHOST to a disposable PostgreSQL socket directory and PGPORT to its port.');
  }
  const config = {host:PGHOST,port:Number(PGPORT),database:'slopboy_build_fixture'};
  if (command === 'work' && key === undefined) {
    console.log(await runNextFixtureBuild(config));
  } else if ((command === 'enqueue' || command === 'status') && key) {
    console.log(await (command === 'enqueue' ? enqueueFixture : fixtureStatus)(config,key));
  } else {
    throw new Error('Usage: fixture-build-cli.ts enqueue <UUID> | status <UUID> | work');
  }
}

main().catch(error => {
  console.error(error instanceof Error && ['Expected a UUID','Set PGHOST'].some(prefix => error.message.startsWith(prefix))
    ? error.message : 'Fixture worker request failed. Verify the disposable database and command.');
  process.exitCode = 1;
});
