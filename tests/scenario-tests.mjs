import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidSocialUrl } from '../lib/social-urls.ts';
import { safeInternalPath } from '../lib/safe-redirect.ts';
import { isUuid, boundedText, optionalText, integerIn, validSkills, validRoleInput, validProjectInput } from '../lib/validation.ts';
import { isProjectStale } from '../lib/time.ts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('Attack Scenario 5: XSS script payload in bio or description', () => {
  const payload = '<script>alert(1)</script>';
  const markup = renderToStaticMarkup(createElement('div', null, payload));
  assert.equal(markup.includes('<script>'), false);
  assert.equal(markup.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), true);
});

test('Attack Scenario 6: javascript: and data: URLs in social and team links', () => {
  const dangerousUrls = [
    'javascript:alert(1)',
    'javascript://alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'https://user:pass@evil.com',
    '//evil.com',
  ];

  for (const url of dangerousUrls) {
    assert.equal(isValidSocialUrl(url), false, `Should reject: ${url}`);
  }

  assert.equal(isValidSocialUrl('https://discord.gg/teamies'), true);
  assert.equal(isValidSocialUrl('https://github.com/myorg/project'), true);
});

test('Attack Scenario: Open redirects are blocked by safeInternalPath', () => {
  const maliciousPaths = [
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '/%5cevil.com',
    'javascript:alert(1)',
    '/\n/evil.com',
  ];

  for (const path of maliciousPaths) {
    assert.equal(safeInternalPath(path), '/dashboard', `Should redirect to /dashboard instead of: ${path}`);
  }

  assert.equal(safeInternalPath('/settings/profile'), '/settings/profile');
  assert.equal(safeInternalPath('/projects/123?tab=roles'), '/projects/123?tab=roles');
});

test('Attack Scenario: Manipulated non-UUID IDs in mutations', () => {
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid('../../../etc/passwd'), false);
  assert.equal(isUuid("1' OR '1'='1"), false);
  assert.equal(isUuid('10000000-0000-0000-0000-000000000001'), true);
});

test('Attack Scenario: Duplicate or oversized skills / tags injection', () => {
  assert.equal(validSkills(['React', 'react']), false); // Case-insensitive duplicate rejected
  assert.equal(validSkills(Array.from({ length: 31 }, (_, i) => `Skill${i}`)), false); // Max 30
  assert.equal(validSkills(['a'.repeat(61)]), false); // Max 60 chars per skill
  assert.equal(validSkills(['React', 'TypeScript', 'Node.js']), true);
});

test('Attack Scenario 12: Stale detection behavior across lifecycle & recruiting states', () => {
  const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

  // Completed, cancelled, and archived projects are NEVER stale
  assert.equal(isProjectStale(thirtyOneDaysAgo, true, 'completed', 'open'), false);
  assert.equal(isProjectStale(thirtyOneDaysAgo, true, 'cancelled', 'open'), false);
  assert.equal(isProjectStale(thirtyOneDaysAgo, true, 'archived', 'open'), false);

  // Paused and closed recruitment are NEVER stale
  assert.equal(isProjectStale(thirtyOneDaysAgo, true, 'active', 'paused'), false);
  assert.equal(isProjectStale(thirtyOneDaysAgo, true, 'active', 'closed'), false);

  // Only open/active with open recruiting and > 30 days inactivity is stale
  assert.equal(isProjectStale(thirtyOneDaysAgo, true, 'active', 'open'), true);
  assert.equal(isProjectStale(thirtyOneDaysAgo, true, 'open', 'open'), true);
});

