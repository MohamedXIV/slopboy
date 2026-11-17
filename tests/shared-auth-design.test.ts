import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=(path:string)=>readFile(new URL('../apps/web/'+path,import.meta.url),'utf8');

test('live sign-in and Design Lab use one native HeroUI auth panel',async()=>{
  const [panel,live,lab,styles,labStyles]=await Promise.all([
    source('components/ui/SlopboyAuthPanel.tsx'),
    source('app/(modern)/auth/sign-in/page.tsx'),
    source('components/design/BatchTwoLab.tsx'),
    source('components/ui/slopboy-auth-panel.css'),
    source('components/design/batch-two.css'),
  ]);

  assert.match(panel,/import \{Card,Chip,Tabs\} from '@heroui\/react'/);
  assert.match(panel,/<Tabs\.Tab id="create-account" isDisabled>/);
  assert.match(live,/import SlopboyAuthPanel/);
  assert.match(live,/<SlopboyAuthPanel titleId="sb-auth-title"/);
  assert.match(lab,/import SlopboyAuthPanel/);
  assert.match(lab,/<SlopboyAuthPanel titleId="sb-b2-auth-preview-title"/);
  assert.match(styles,/\.sb-auth-card\.card/);
  assert.doesNotMatch(labStyles,/\.sb-b2-auth-tabs/,
    'Design Lab must not maintain a second independent implementation of the same tabs');
});
