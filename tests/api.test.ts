import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { openDb } from '../server/db.ts';
import { createApp } from '../server/app.ts';

let server: Server;
let base: string;

before(async () => {
  const db = openDb(':memory:');
  server = createApp(db).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

/** Minimal cookie-jar client: one per simulated user. */
function client() {
  let cookie = '';
  const call = async (method: string, path: string, body?: unknown) => {
    const isForm = body instanceof FormData;
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return {
    call,
    login: (email: string) => call('POST', '/api/auth/login', { email }),
  };
}

async function signedIn(email: string) {
  const c = client();
  const res = await c.login(email);
  assert.equal(res.status, 200);
  return c;
}

function fileForm(name: string, contents: string | Buffer, type = 'application/octet-stream') {
  const form = new FormData();
  const part = typeof contents === 'string' ? contents : new Uint8Array(contents);
  form.append('file', new Blob([part], { type }), name);
  return form;
}

describe('auth', () => {
  test('document routes require a session', async () => {
    const res = await client().call('GET', '/api/documents');
    assert.equal(res.status, 401);
  });

  test('unknown accounts cannot sign in', async () => {
    const res = await client().login('mallory@example.com');
    assert.equal(res.status, 401);
  });
});

describe('documents', () => {
  test('create, rename, save and reopen preserves formatting', async () => {
    const alice = await signedIn('alice@folio.test');
    const created = await alice.call('POST', '/api/documents', { title: '  Draft  ' });
    assert.equal(created.status, 201);
    assert.equal(created.body.title, 'Draft');
    assert.equal(created.body.role, 'owner');

    const html = '<h2>Heading</h2><p><strong>b</strong> <em>i</em> <u>u</u></p><ul><li><p>one</p></li></ul>';
    const saved = await alice.call('PATCH', `/api/documents/${created.body.id}`, {
      title: 'Renamed',
      content: html,
      baseVersion: created.body.version,
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.version, created.body.version + 1);

    const reopened = await alice.call('GET', `/api/documents/${created.body.id}`);
    assert.equal(reopened.body.title, 'Renamed');
    assert.equal(reopened.body.content, html);
  });

  test('stored HTML is sanitized (scripts and event handlers removed)', async () => {
    const alice = await signedIn('alice@folio.test');
    const doc = (await alice.call('POST', '/api/documents', {})).body;
    await alice.call('PATCH', `/api/documents/${doc.id}`, {
      content: '<p onclick="steal()">hi<script>alert(1)</script><img src=x onerror=alert(1)></p><a href="javascript:x">l</a>',
      baseVersion: doc.version,
    });
    const { body } = await alice.call('GET', `/api/documents/${doc.id}`);
    assert.equal(doc.title, 'Untitled document');
    assert.doesNotMatch(body.content, /script|onclick|onerror|img|javascript/i);
    assert.match(body.content, /<p>hi<\/p>/);
  });

  test('stale saves are rejected with 409 unless forced', async () => {
    const alice = await signedIn('alice@folio.test');
    const doc = (await alice.call('POST', '/api/documents', {})).body;
    const first = await alice.call('PATCH', `/api/documents/${doc.id}`, { content: '<p>v2</p>', baseVersion: doc.version });
    assert.equal(first.status, 200);

    const stale = await alice.call('PATCH', `/api/documents/${doc.id}`, { content: '<p>old</p>', baseVersion: doc.version });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'version_conflict');
    assert.equal(stale.body.error.currentVersion, first.body.version);

    const forced = await alice.call('PATCH', `/api/documents/${doc.id}`, { content: '<p>mine</p>', force: true });
    assert.equal(forced.status, 200);
  });

  test('validation errors return 400 with a message', async () => {
    const alice = await signedIn('alice@folio.test');
    const doc = (await alice.call('POST', '/api/documents', {})).body;
    const noop = await alice.call('PATCH', `/api/documents/${doc.id}`, {});
    assert.equal(noop.status, 400);
    const longTitle = await alice.call('PATCH', `/api/documents/${doc.id}`, { title: 'x'.repeat(201) });
    assert.equal(longTitle.status, 400);
    const noVersion = await alice.call('PATCH', `/api/documents/${doc.id}`, { content: '<p>x</p>' });
    assert.equal(noVersion.status, 400);
    assert.ok(noVersion.body.error.message);
  });
});

describe('sharing and access control', () => {
  test('full share lifecycle: none -> viewer -> editor -> revoked', async () => {
    const alice = await signedIn('alice@folio.test');
    const bob = await signedIn('bob@folio.test');
    const carol = await signedIn('carol@folio.test');
    const doc = (await alice.call('POST', '/api/documents', { title: 'Secret plan' })).body;
    const url = `/api/documents/${doc.id}`;

    // No access: 404 (existence is not revealed), and not in Bob's list.
    assert.equal((await bob.call('GET', url)).status, 404);
    assert.ok(!(await bob.call('GET', '/api/documents')).body.shared.some((d: any) => d.id === doc.id));

    // Only the owner can share.
    assert.equal((await bob.call('POST', `${url}/shares`, { email: 'bob@folio.test', role: 'editor' })).status, 404);

    // Viewer: can read, cannot write or reshare.
    const shared = await alice.call('POST', `${url}/shares`, { email: 'BOB@folio.test', role: 'viewer' });
    assert.equal(shared.status, 200);
    assert.deepEqual(shared.body.shares.map((s: any) => [s.user.email, s.role]), [['bob@folio.test', 'viewer']]);

    const bobList = (await bob.call('GET', '/api/documents')).body;
    const entry = bobList.shared.find((d: any) => d.id === doc.id);
    assert.equal(entry.role, 'viewer');
    assert.equal(entry.owner.email, 'alice@folio.test');
    assert.ok(!bobList.owned.some((d: any) => d.id === doc.id));

    assert.equal((await bob.call('GET', url)).body.role, 'viewer');
    assert.equal((await bob.call('PATCH', url, { title: 'hacked' })).status, 403);
    assert.equal((await bob.call('POST', `${url}/shares`, { email: 'carol@folio.test' })).status, 403);
    assert.equal((await bob.call('DELETE', url)).status, 403);

    // Editor: can write, still cannot delete or reshare.
    await alice.call('POST', `${url}/shares`, { email: 'bob@folio.test', role: 'editor' });
    const edit = await bob.call('PATCH', url, { content: '<p>bob was here</p>', baseVersion: doc.version });
    assert.equal(edit.status, 200);
    assert.equal(edit.body.updatedBy.email, 'bob@folio.test');
    assert.equal((await bob.call('DELETE', url)).status, 403);

    // Carol was never granted anything.
    assert.equal((await carol.call('GET', url)).status, 404);

    // Revoke.
    const revoked = await alice.call('DELETE', `${url}/shares/u_bob`);
    assert.deepEqual(revoked.body.shares, []);
    assert.equal((await bob.call('GET', url)).status, 404);
  });

  test('sharing rejects unknown users, invalid roles and the owner', async () => {
    const alice = await signedIn('alice@folio.test');
    const doc = (await alice.call('POST', '/api/documents', {})).body;
    const url = `/api/documents/${doc.id}/shares`;
    assert.equal((await alice.call('POST', url, { email: 'nobody@folio.test' })).status, 404);
    assert.equal((await alice.call('POST', url, { email: 'bob@folio.test', role: 'admin' })).status, 400);
    assert.equal((await alice.call('POST', url, { email: 'alice@folio.test' })).status, 400);
  });

  test('a collaborator can remove themselves', async () => {
    const alice = await signedIn('alice@folio.test');
    const carol = await signedIn('carol@folio.test');
    const doc = (await alice.call('POST', '/api/documents', {})).body;
    await alice.call('POST', `/api/documents/${doc.id}/shares`, { email: 'carol@folio.test' });
    assert.equal((await carol.call('DELETE', `/api/documents/${doc.id}/shares/u_carol`)).status, 200);
    assert.equal((await carol.call('GET', `/api/documents/${doc.id}`)).status, 404);
  });
});

describe('file import', () => {
  test('markdown becomes a formatted document titled after the file', async () => {
    const alice = await signedIn('alice@folio.test');
    const md = '# Roadmap\n\nSome **bold** and _italic_ text.\n\n- one\n- two\n\n1. first\n2. second\n';
    const res = await alice.call('POST', '/api/documents/import', fileForm('roadmap.md', md));
    assert.equal(res.status, 201);
    assert.equal(res.body.title, 'roadmap');
    assert.match(res.body.content, /<h1>Roadmap<\/h1>/);
    assert.match(res.body.content, /<strong>bold<\/strong>/);
    assert.match(res.body.content, /<em>italic<\/em>/);
    assert.match(res.body.content, /<ul>[\s\S]*<li>one<\/li>/);
    assert.match(res.body.content, /<ol>/);
  });

  test('plain text keeps paragraphs and escapes HTML', async () => {
    const alice = await signedIn('alice@folio.test');
    const res = await alice.call('POST', '/api/documents/import', fileForm('notes.txt', 'line one\nline two\n\n<b>not bold</b>'));
    assert.equal(res.status, 201);
    assert.equal(res.body.content, '<p>line one<br />line two</p><p>&lt;b&gt;not bold&lt;/b&gt;</p>');
  });

  test('docx is converted with inline formatting', async () => {
    const alice = await signedIn('alice@folio.test');
    const docx = readFileSync(new URL('./fixtures/meeting-notes.docx', import.meta.url));
    const res = await alice.call('POST', '/api/documents/import', fileForm('meeting-notes.docx', docx));
    assert.equal(res.status, 201);
    assert.equal(res.body.title, 'meeting-notes');
    assert.match(res.body.content, /<strong>bold<\/strong>/);
    assert.match(res.body.content, /<em>italic<\/em>/);
  });

  test('unsupported and corrupt files are rejected clearly', async () => {
    const alice = await signedIn('alice@folio.test');
    const pdf = await alice.call('POST', '/api/documents/import', fileForm('report.pdf', '%PDF-1.4'));
    assert.equal(pdf.status, 415);
    assert.match(pdf.body.error.message, /\.txt, \.md, \.markdown, \.docx/);

    const badDocx = await alice.call('POST', '/api/documents/import', fileForm('broken.docx', 'not a zip'));
    assert.equal(badDocx.status, 422);

    const missing = await alice.call('POST', '/api/documents/import', new FormData());
    assert.equal(missing.status, 400);
  });

  test('files over 5 MB are rejected with 413', async () => {
    const alice = await signedIn('alice@folio.test');
    const res = await alice.call('POST', '/api/documents/import', fileForm('big.txt', 'a'.repeat(5 * 1024 * 1024 + 1)));
    assert.equal(res.status, 413);
  });
});
