import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidSocialUrl, normalizeInstagramUrl, normalizeSocialUrl } from '../lib/social-urls.ts';
import { safeInternalPath } from '../lib/safe-redirect.ts';
import { validProjectInput, validRoleInput, isUuid } from '../lib/validation.ts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('unsafe links cannot become rendered links', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'https://user:pass@example.com', 'https://good.com\\@evil.com', 'https://good.com\n.evil.com']) {
    assert.equal(isValidSocialUrl(value), false, value);
    assert.equal(isValidSocialUrl(normalizeSocialUrl(value)), false, value);
  }
  assert.equal(isValidSocialUrl('https://example.com/path?q=value#anchor'), true);
  assert.equal(normalizeInstagramUrl('@a.b'), 'https://instagram.com/a.b');
  assert.equal(normalizeInstagramUrl('https://notinstagram.com/name'), 'https://notinstagram.com/name');
});
test('redirects remain local', () => {
  for (const path of ['//evil.com','/\\evil.com','/\n/evil.com','/%5cevil.com','https://evil.com','javascript:alert(1)',null]) {
    assert.equal(safeInternalPath(path), '/dashboard');
  }
  assert.equal(safeInternalPath('/settings/profile?tab=links'), '/settings/profile?tab=links');
});
test('malformed action inputs reject without throwing', () => {
  for (const input of [null, [], {}, 'text', 7, { title: 42 }, { title: 'Role', positions: NaN }, { title: 'Role', positions: Infinity }]) {
    assert.equal(validRoleInput(input), false);
    assert.equal(validProjectInput(input), false);
  }
  assert.equal(validRoleInput({ title: 'Engineer', positions: 1, required_skills: ['JS','js'] }), false);
  assert.equal(validRoleInput({ title: 'Engineer', positions: 1, required_skills: ['JS'] }), true);
  assert.equal(isUuid({}), false);
});
test('React text rendering escapes stored script content', () => {
  const html = renderToStaticMarkup(createElement('p', null, '<script>alert(1)</script>'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});
