// Who rang: the judge behind `wikipedia({ onlyPeople: true })`.
//
// The one property that matters is asymmetry: nothing a machine does may
// ring the bell. A person sent to the breath is a pity, not a failure.
import { createHumanity, categoryFor, BOT_NAME_RE, TOOL_RE, REVERT_RE } from '../src/sources/humanity.js';
import { wikipedia } from '../src/sources/wikimedia.js';

let fails = 0;
const failedNames = [];
const ok = (name, cond, extra = '') => {
  if (!cond) {
    fails++; failedNames.push(name);
    console.log('FAIL  ' + name + (extra ? '  ' + extra : ''));
  } else console.log('ok    ' + name + (extra ? '  ' + extra : ''));
};

const edit = (over = {}) => ({
  wiki: 'enwiki',
  server_url: 'https://en.wikipedia.org',
  type: 'edit',
  namespace: 0,
  title: 'Campanology',
  user: 'Quiet editor',
  bot: false,
  comment: 'Added a paragraph on change ringing',
  length: { old: 1000, new: 1400 },
  ...over,
});

// --- the signs of a machine, each alone --------------------------------
{
  const groups = new Map([['Quiet editor', false], ['Vouched', false], ['Sneaky', true]]);
  const asked = [];
  const lookup = async (_url, users) => {
    asked.push(users);
    return new Map(users.map((u) => [u, groups.has(u) ? groups.get(u) : null]));
  };
  const h = createHumanity({ lookup, globalBots: async () => new Set(['Global Worker']), holdFor: 80, gather: 10 });

  ok('the bot flag is a machine', h.judge(edit({ bot: true })).reason === 'flag');
  ok('Wikidata is a machine wiki', h.judge(edit({ wiki: 'wikidatawiki' })).reason === 'wikidata');
  for (const name of ['ClueBot NG', 'InternetArchiveBot', 'Foo-bot 2', 'BotMultichill', 'FOOBOT', 'Robotique', 'MediaWiki message delivery']) {
    ok(`a bot-shaped name is a machine: ${name}`, h.judge(edit({ user: name })).reason === 'name');
  }
  for (const name of ['Abbott', 'Talbott', 'Botany lover', 'Sabotage']) {
    ok(`a name only containing the letters is not: ${name}`, h.judge(edit({ user: name })).reason !== 'name', h.judge(edit({ user: name })).reason);
  }
  ok('an IP never has a bot-shaped name test', h.judge(edit({ user: '203.0.113.7' })).verdict === 'human');
  ok('an IP is a person without an account', h.judge(edit({ user: '2001:db8::1' })).reason === 'no-account');

  for (const c of ['Cleanup using [[Project:AWB|AWB]]', 'using HotCat', 'Bot: fixing links', 'automatically adding category', 'Reverting vandalism with Huggle', 'Robot : Adding interwiki']) {
    ok(`a tool in the summary is unsure: ${c}`, h.judge(edit({ comment: c })).reason === 'tool');
  }
  for (const c of ['Reverted edits by 1.2.3.4', 'Undid revision 12345', 'Annulation de la modification 42', 'Rückgängig gemacht']) {
    ok(`a revert is unsure: ${c}`, h.judge(edit({ comment: c })).reason === 'revert');
  }
  ok('a sentence about a robot in an article summary is caught too (asymmetry)', h.judge(edit({ comment: 'Expanded the section on the robot uprising' })).verdict !== 'human');

  // Cadence: nine distinct pages inside the window, and the hand is a machine.
  const fast = createHumanity({ lookup: async () => false, limit: 8, window: 120_000 });
  let last;
  for (let i = 0; i < 9; i++) last = fast.judge(edit({ user: 'Hasty', title: 'Page ' + i }));
  ok('nine pages in two minutes is a cadence no hand keeps', last.reason === 'cadence', last.reason);
  const slow = createHumanity({ lookup: async () => false, limit: 8 });
  for (let i = 0; i < 9; i++) last = slow.judge(edit({ user: 'Patient', title: 'Same page' }));
  ok('nine saves of the same page is one person at work', last.reason !== 'cadence', last.reason);

  // Group, via the wiki.
  ok('an account never asked about is unsure, and names the reason', h.judge(edit({ user: 'Vouched' })).reason === 'unknown-account');
  const settled = await h.settle(edit({ user: 'Vouched' }));
  ok('once the wiki vouches, the account is a person', settled.verdict === 'human' && settled.reason === 'account', JSON.stringify(settled));
  ok('and the judge remembers without asking again', h.judge(edit({ user: 'Vouched' })).reason === 'account');
  const sneaky = await h.settle(edit({ user: 'Sneaky' }));
  ok('an unflagged edit from a bot-group account is still a machine', sneaky.verdict === 'machine' && sneaky.reason === 'group', JSON.stringify(sneaky));
  const nobody = await h.settle(edit({ user: 'Nobody the wiki knows' }));
  ok('no answer from the wiki is unsure, never human', nobody.verdict === 'unsure' && nobody.reason === 'unanswered', JSON.stringify(nobody));
  ok('and is not remembered, so the next edit asks again', h.judge(edit({ user: 'Nobody the wiki knows' })).reason === 'unknown-account');
  ok('the judge remembers only what was answered', h.known === 2, String(h.known));
  const globalBot = await h.settle(edit({ user: 'Global Worker' }));
  ok('a global bot is a machine even with no local flag or group', globalBot.verdict === 'machine' && globalBot.reason === 'group', JSON.stringify(globalBot));

  // Batching: a burst of new names is one question to the wiki, not one each.
  const before = asked.length;
  const burst = await Promise.all(Array.from({ length: 30 }, (_, i) => h.settle(edit({ user: 'Newcomer ' + i }))));
  const calls = asked.slice(before);
  ok('thirty new accounts in a burst are one question', calls.length === 1 && calls[0].length === 30, `${calls.length} calls, ${calls.map((c) => c.length).join('+')} names`);
  ok('and each of them is answered on its own', burst.every((v) => v.reason === 'unanswered'));
  const big = await Promise.all(Array.from({ length: 70 }, (_, i) => h.settle(edit({ user: 'Crowd ' + i }))));
  const calls2 = asked.slice(before + 1);
  ok('seventy are two questions, since the API takes fifty at a time', calls2.length === 2 && calls2[0].length === 50 && calls2[1].length === 20, calls2.map((c) => c.length).join('+'));
  ok('every one of the seventy got a verdict', big.length === 70 && big.every((v) => v.verdict === 'unsure'));
}

// --- a slow wiki never holds the feed for long --------------------------
{
  const h = createHumanity({ lookup: () => new Promise(() => {}), globalBots: async () => new Set(), holdFor: 30, gather: 1 });
  const t0 = Date.now();
  const v = await h.settle(edit({ user: 'Someone' }));
  ok('a wiki that never answers is given up on within the hold', Date.now() - t0 < 500 && v.verdict === 'unsure', `${Date.now() - t0} ms, ${v.reason}`);
}

// --- the real question, in the shape the wiki answers it ---------------
{
  const { lookupGroups } = await import('../src/sources/humanity.js');
  const seen = [];
  const fakeFetch = async (url) => {
    seen.push(url);
    return {
      ok: true,
      json: async () => ({ query: { users: [
        { userid: 1, name: 'A person', groups: ['*', 'user', 'autoconfirmed'] },
        { userid: 2, name: 'A robot', groups: ['*', 'user', 'bot'] },
        { name: 'Nobody', missing: '' },
      ] } }),
    };
  };
  const m = await lookupGroups('https://en.wikipedia.org', ['A person', 'A robot', 'Nobody'], fakeFetch);
  ok('one request carries every name', seen.length === 1 && /ususers=A%20person%7CA%20robot%7CNobody/.test(seen[0]), seen[0]);
  ok('a person is false, a robot true, a missing account null', m.get('A person') === false && m.get('A robot') === true && m.get('Nobody') === null);
  const throttled = await lookupGroups('https://en.wikipedia.org', ['X'], async () => ({ ok: true, json: async () => { throw new Error('not JSON'); } }));
  ok('a throttled answer is null for everyone, never a verdict', throttled.get('X') === null);
}

// --- category -----------------------------------------------------------
ok('a person with an account is user', categoryFor('human', false) === 'user');
ok('a person without one is anon', categoryFor('human', true) === 'anon');
ok('a machine is the breath', categoryFor('machine', false) === 'bot');
ok('and so is a doubt', categoryFor('unsure', true) === 'bot');

// --- the patterns are exported and sane ---------------------------------
ok('BOT_NAME_RE minds its capitals: Bot inside a camel-cased name, not bot inside a word', BOT_NAME_RE.test('WikiBot') && !BOT_NAME_RE.test('Abbotsford'));
ok('TOOL_RE does not fire on an ordinary summary', !TOOL_RE.test('Fixed the dates in the infobox'));
ok('REVERT_RE does not fire on an ordinary summary', !REVERT_RE.test('Added a reference'));

// --- the Wikipedia source, end to end, without a network ------------------
{
  // A fake EventSource that hands the source whatever the test pushes.
  const pushed = [];
  globalThis.EventSource = class {
    constructor() { this.readyState = 1; pushed.push(this); }
    addEventListener(name, fn) { if (name === 'message') this.fn = fn; }
    close() {}
  };
  const groups = new Map([['Vouched', false], ['Sneaky', true]]);
  const judge = createHumanity({
    lookup: async (_u, users) => new Map(users.map((u) => [u, groups.has(u) ? groups.get(u) : null])),
    globalBots: async () => new Set(),
    holdFor: 50,
    gather: 5,
  });

  const plain = wikipedia({ langs: ['en'], humanity: judge });
  const got = [];
  plain.start((e) => got.push(e));
  const es = pushed[pushed.length - 1];
  const send = (d) => es.fn({ data: JSON.stringify(d) });
  send(edit({ user: 'Sneaky' }));
  ok('without onlyPeople the category is what it always was', got.length === 1 && got[0].category === 'user', JSON.stringify(got[0] && got[0].category));
  ok('but the verdict rides along for anyone who wants it', got[0].humanity && typeof got[0].humanity.verdict === 'string');

  const strict = wikipedia({ langs: ['en'], onlyPeople: true, humanity: judge });
  const heard = [];
  strict.start((e) => heard.push(e));
  const es2 = pushed[pushed.length - 1];
  const send2 = (d) => es2.fn({ data: JSON.stringify(d) });
  send2(edit({ user: 'ClueBot NG' }));
  send2(edit({ user: '203.0.113.7' }));
  send2(edit({ user: 'Vouched' }));
  send2(edit({ user: 'Sneaky' }));
  ok('a known machine is emitted at once, as the breath', heard.length >= 2 && heard[0].category === 'bot' && heard[0].humanity.reason === 'name');
  ok('a person without an account is emitted at once, as anon', heard[1].category === 'anon');
  ok('unknown accounts are held, not dropped and not yet heard', heard.length === 2, String(heard.length));
  await new Promise((r) => setTimeout(r, 120));
  ok('after the wiki answers both are heard', heard.length === 4, String(heard.length));
  const vouched = heard.find((e) => e.data.user === 'Vouched');
  const sneaky = heard.find((e) => e.data.user === 'Sneaky');
  ok('the vouched account rings', vouched && vouched.category === 'user' && !vouched.hold, JSON.stringify(vouched && vouched.humanity));
  ok('the bot-group account breathes', sneaky && sneaky.category === 'bot' && sneaky.humanity.reason === 'group', JSON.stringify(sneaky && sneaky.humanity));
  send2(edit({ user: 'Sneaky', title: 'Another page' }));
  ok('the second time it is not held at all', heard.length === 5 && heard[4].category === 'bot');
  strict.stop();
  plain.stop();
}

console.log(fails ? `\n${fails} failed: ${failedNames.join(', ')}` : '\nall ok');
process.exit(fails ? 1 : 0);
