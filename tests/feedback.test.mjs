import test from 'node:test';
import assert from 'node:assert/strict';
import { validFeedback, pageContext } from '../lib/feedback/validation.ts';
const valid = { requestId: '12345678-1234-1234-1234-123456789012', type:'bug', rating:4, title:'Broken link', message:'The project link is not opening.', context:'/dashboard', isPublic:false, isAnonymous:true };
test('feedback validates types, lengths, consent and ratings', () => {
  assert.equal(validFeedback(valid),true);
  for (const v of [null, [], {}, {...valid,rating:0}, {...valid,rating:6}, {...valid,rating:1.5}, {...valid,rating:'4'}, {...valid,title:'  '}, {...valid,message:'short'}, {...valid,message:'x'.repeat(4001)}, {...valid,type:'constructor'}, {...valid,isPublic:'true'}, {...valid,requestId:'fake'}, {...valid,message:'unsafe\u0000 input'}]) assert.equal(validFeedback(v),false);
});
test('context excludes identifiers, query strings and unknown routes', () => {
  assert.equal(pageContext('/profile/private-name?email=secret'),'/profile/[username]');
  assert.equal(pageContext('/projects/secret-id#invite'),'/projects/[id]');
  assert.equal(pageContext('/dashboard?token=secret'),'/dashboard');
  assert.equal(pageContext('/unknown/private'),'/other');
});
