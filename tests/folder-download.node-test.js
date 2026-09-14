const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadController(filename, mocks) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers', filename), 'utf8'), {
    module, exports: module.exports, process: { env: {} }, URL, URLSearchParams,
    console: { log() {}, warn() {}, error() {} },
    require: (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (['path', 'stream', 'crypto'].includes(name)) return require(name);
      return {};
    },
  });
  return module.exports;
}

function response() {
  return { code: 200, headers: {}, status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }, setHeader(key, value) { this.headers[key] = value; }, end() {} };
}

test('URL generation preserves all scoped folders', async () => {
  const controller = loadController('externalFileManager.controller.js', {
    'http-status': { OK: 200, BAD_REQUEST: 400 },
    '../models': { FileMeta: { findOne: () => ({ sort: async () => ({ path: 'Event - Demo/' }) }) } },
  });
  const res = response();
  await controller.getFolderDownloadUrl({ protocol: 'https', get: () => 'files.test', query: {}, body: {
    externalId: 'event_demo', folders: [{ path: 'Rachana' }, { phase: 'post', path: 'Rachana' }],
  } }, res, (error) => { throw error; });
  assert.equal(res.code, 200);
  assert.deepEqual(new URL(res.body.data.url).searchParams.getAll('folderpath'), [
    'Event - Demo/Rachana/', 'Event - Demo/Post-Production/Rachana/',
  ]);
});

async function download(folderpath, names, method = 'GET') {
  const prefixes = [];
  const entries = [];
  let finalized = false;
  const controller = loadController('gcpFile.controller.js', {
    '../utils/catchAsync': (fn) => fn,
    '../services/gcpFile.service': { bucket: { getFiles: async ({ prefix }) => {
      prefixes.push(prefix);
      return [names.filter((name) => name.startsWith(prefix)).map((name) => ({ name, metadata: { size: '5' }, createReadStream: () => name }))];
    } } },
    archiver: () => ({ on() {}, pipe() {}, append(source, entry) { entries.push(entry.name); }, async finalize() { finalized = true; } }),
  });
  const res = response();
  await controller.downloadFolder({ query: { folderpath }, method }, res, (error) => { throw error; });
  return { res, prefixes, entries, finalized };
}

test('combined ZIP keeps nested paths and duplicate basenames, excludes other creators', async () => {
  const { entries, finalized, res } = await download(['Event - Demo/Rachana', 'Event - Demo/Post-Production/Rachana'], [
    'Website_Shoots_Flow/Event - Demo/Rachana/photo.jpg',
    'Website_Shoots_Flow/Event - Demo/Post-Production/Rachana/nested/photo.jpg',
    'Website_Shoots_Flow/Event - Demo/Rachana Other/private.jpg',
  ]);
  assert.deepEqual(entries, ['Rachana/photo.jpg', 'Post-Production/Rachana/nested/photo.jpg']);
  assert.equal(res.headers['X-Total-Size'], '10');
  assert.equal(finalized, true);
});

test('single folder retains relative archive paths and exact folder boundary', async () => {
  const { prefixes, entries } = await download('Event - Demo/Rachana', [
    'Website_Shoots_Flow/Event - Demo/Rachana/nested/photo.jpg',
    'Website_Shoots_Flow/Event - Demo/Rachana Other/private.jpg',
  ]);
  assert.deepEqual(prefixes, ['Website_Shoots_Flow/Event - Demo/Rachana/']);
  assert.deepEqual(entries, ['nested/photo.jpg']);
});

test('overlapping folder roots do not duplicate ZIP entries', async () => {
  const { entries } = await download(['Event - Demo/Rachana', 'Event - Demo/Rachana/nested'], [
    'Website_Shoots_Flow/Event - Demo/Rachana/nested/photo.jpg',
  ]);
  assert.deepEqual(entries, ['nested/photo.jpg']);
});

test('missing folder path returns 400', async () => {
  assert.equal((await download(undefined, [])).res.code, 400);
});

test('empty folder returns 404', async () => {
  assert.equal((await download('Event - Demo/Rachana', [])).res.code, 404);
});

test('HEAD reports total size without creating an archive', async () => {
  const { res, finalized } = await download('Event - Demo/Rachana', ['Website_Shoots_Flow/Event - Demo/Rachana/photo.jpg'], 'HEAD');
  assert.equal(res.headers['X-Total-Size'], '5');
  assert.equal(finalized, false);
});
