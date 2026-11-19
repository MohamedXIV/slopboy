import assert from 'node:assert/strict';
import test from 'node:test';
import { handleMcpHttpRequest } from '../packages/mcp/src/index.ts';

function request(method: string, params?: unknown) {
  return handleMcpHttpRequest({
    method: 'POST',
    headers: {},
    body: JSON.stringify({ jsonrpc: '2.0', id: 3, method, params }),
  }, {});
}

test('public tools advertise versioned, closed argument schemas', async () => {
  const {body} = await request('tools/list');
  const { tools } = JSON.parse(body).result;
  assert.equal(tools.length, 5);
  for (const tool of tools) {
    assert.equal(tool._meta['slopboy.dev/contractVersion'], '1.0.0');
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
  assert.ok(!tools.some((tool: { name: string }) => tool.name === 'create_game_draft'));
});

test('tool argument errors identify fields without echoing caller data', async () => {
  for (const [name, args, field] of [
    ['get_game_template', {}, 'engineId'],
    ['get_engine_capabilities', { engineId: 'invalid-secret-value' }, 'engineId'],
    ['list_supported_engines', { deviceProfile: 'invalid-secret-value' }, 'deviceProfile'],
    ['recommend_engine', { prompt: 12 }, 'prompt'],
    ['recommend_engine', { prompt: '   ' }, 'prompt'],
    ['recommend_engine', { prompt: 'x'.repeat(4001) }, 'prompt'],
    ['validate_game_source', { engineId: 'kaplay', sourceCode: 'é'.repeat(32769) }, 'sourceCode'],
    ['validate_game_source', { engineId: 'kaplay', sourceCode: 'text', manifest: [] }, 'manifest'],
    ['list_supported_engines', { unexpected: 'invalid-secret-value' }, 'arguments'],
    ['list_supported_engines', null, 'arguments'],
  ] as const) {
    const { body, status } = await request('tools/call', { name, arguments: args });
    assert.equal(status, 200);
    assert.deepEqual(JSON.parse(body).error?.data, { code: 'INVALID_TOOL_ARGUMENTS', field });
    assert.equal(JSON.parse(body).error.code, -32602);
    assert.ok(!body.includes('invalid-secret-value'));
  }
});

test('a direct write request fails closed without configured persistence', async () => {
  const response = await request('tools/call', { name: 'create_game_draft', arguments: {} });
  assert.equal(response.status, 503);
  assert.equal(JSON.parse(response.body).error.data.code, 'TOOL_UNAVAILABLE');
});

test('tool results retain their text payload and manifest diagnostics', async () => {
  const list = await request('tools/call', { name: 'list_supported_engines' });
  assert.equal(list.status, 200);
  assert.ok(JSON.parse(JSON.parse(list.body).result.content[0].text).length > 0);

  const template = await request('tools/call', {
    name: 'get_game_template',
    arguments: { engineId: 'kaplay', title: '🕹'.repeat(80) },
  });
  assert.equal(template.status, 200);
  const content = JSON.parse(template.body).result.content[0];
  assert.equal(content.type, 'text');
  assert.equal(JSON.parse(content.text).manifest.title, '🕹'.repeat(80));

  const validation = await request('tools/call', {
    name: 'validate_game_source',
    arguments: { engineId: 'kaplay', sourceCode: '', manifest: {} },
  });
  assert.equal(validation.status, 200);
  const report = JSON.parse(JSON.parse(validation.body).result.content[0].text);
  assert.equal(report.valid, false);
  assert.ok(report.diagnostics.some((item: { code: string }) => item.code === 'EMPTY_SOURCE'));
  assert.ok(report.diagnostics.some((item: { file: string }) => item.file === 'manifest.json'));
});

test('an unknown tool name produces a stable error without reflecting the name', async () => {
  const { body, status } = await request('tools/call', { name: 'invalid-secret-value' });
  assert.equal(status, 200);
  assert.equal(JSON.parse(body).error.code, -32601);
  assert.equal(JSON.parse(body).error.data.code, 'TOOL_NOT_FOUND');
  assert.ok(!body.includes('invalid-secret-value'));
});
