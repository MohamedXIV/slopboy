import {strict as assert} from 'node:assert';
import test from 'node:test';
import {parseCloudSave} from '../apps/web/lib/cloud-save.ts';

test('cloud backup accepts only bounded opaque UTF-8 save text', () => {
  assert.equal(parseCloudSave({save:'{"position":42}'}),'{"position":42}');
  assert.equal(parseCloudSave({save:'é'.repeat(131072)}),'é'.repeat(131072));
  for (const value of [{save:'é'.repeat(131073)},{save:'a\0b'},{save:'',actorId:'other'},{save:42},null]) {
    assert.equal(parseCloudSave(value),null);
  }
});
