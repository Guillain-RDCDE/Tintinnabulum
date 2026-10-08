// Who rang: telling a person from a machine in a Wikipedia edit.
//
// This file exists for one feed only. Nothing else in the pipeline knows it
// is here; the Wikipedia source asks it a question and passes the answer on
// as the event's category. GitHub, Bluesky, the ingest server and a `curl`
// from a shell are untouched.
//
// Certainty only runs one way. There is no proof that an edit was written by
// a person, but there are several signs that it was not, and any one of them
// is enough. So the rule is asymmetric on purpose: a bell rings only when
// nothing betrays a machine. A person lost to the breath costs the picture
// nothing. A robot ringing the bell would cost it everything.
//
// Three verdicts, each with a reason:
//   'human'    nothing points at a machine, and the account is known not to
//              be one (or cannot be, because it has no account at all)
//   'machine'  the bot flag, the bot group, a bot-shaped name, or a cadence
//              no hand keeps up with
//   'unsure'   a tool signed the summary, a revert, or an account the wiki has
//              not been asked about yet

/**
 * Names a wiki requires of its robots, and the Foundation's maintenance
 * accounts. Case matters: a capital Bot inside a camel-cased name is the
 * convention (ClueBot NG, InternetArchiveBot, BotMultichill), while the
 * letters inside Abbott, Talbott, Botany or Sabotage are not.
 */
export const BOT_NAME_RE = new RegExp(
  [
    'Bot(?![a-z])', // ClueBot NG, InternetArchiveBot, BotMultichill; not Botany
    '(^|[^A-Za-z])[Bb][Oo][Tt](\\s*\\d+)?$', // Foo bot, Foo-bot 2, foo_BOT
    'BOT(\\s*\\d+)?$', // FOOBOT
    '^[Bb]ot[^a-z]', // Bot1, bot-Foo
    '[Rr]obot',
    '^(MediaWiki message delivery|Maintenance script|Flow talk page manager|Abuse filter|Edit filter|Babel AutoCreate|CommonsDelinker|Delinker|Redirect fixer|New user message|ArticleCreationWorkflow|MassMessage|Translation Notifications)',
  ].join('|')
);

/**
 * Tools that sign the edit summary. A hand pressed a button here, and the
 * button wrote the text. That is not the gesture the bell is for.
 */
export const TOOL_RE = new RegExp(
  [
    '\\bAWB\\b',
    'AutoWikiBrowser',
    '\\bJWB\\b',
    'HotCat',
    'WPCleaner',
    'Huggle',
    'Twinkle',
    'Cat-a-lot',
    'QuickStatements',
    'ClueBot',
    'SWViewer',
    'RedWarn',
    'Ultraviolet',
    'OAuth CID',
    '\\[\\[WP:AES\\|',
    '\\bbot\\b',
    '\\brobot\\b',
    'semi-?automat',
    '\\bautomat', // automatic, automatically, automatisch, automatique, automatico
    'автоматич',
    '自動',
  ].join('|'),
  'i'
);

/** A revert is a hand clicking, not a hand writing. */
export const REVERT_RE = new RegExp(
  [
    '^(Reverted|Revert|Undid|Undo|Rollback|Rv\\b|Rvv\\b)',
    'Annulation de la modification',
    'Révocation des modifications',
    'Rückgängig gemacht',
    'Änderung .* rückgängig',
    'Deshecha la edición',
    'Revertidas edições',
    'Annullata la modifica',
    'откат',
    'Отмена правки',
    '取り消し',
    '回退',
  ].join('|'),
  'i'
);

/** Wikis that are, by construction, almost entirely the work of machines. */
export const MACHINE_WIKIS = new Set(['wikidatawiki']);

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$|:/;

// Wikimedia refuses a generic User-Agent with a 429 whatever the rate: thirty
// questions from a bare Node went 0 for 30, the same thirty with this one 30
// for 30. A browser will not let a page set User-Agent and sends its own,
// which is fine; it passes Api-User-Agent, the header Wikimedia asks of
// browser scripts, instead. Both are set, and each side keeps the one it can.
const UA = {
  'User-Agent': 'Tintinnabulum/0.1 (https://guillain-rdcde.github.io/Tintinnabulum/; sonification, who rang)',
  'Api-User-Agent': 'Tintinnabulum/0.1 (https://guillain-rdcde.github.io/Tintinnabulum/; sonification, who rang)',
};

/**
 * Ask a wiki which of these accounts are in its bot group, in one request
 * for up to fifty names. Wikimedia throttles a caller who asks one name at a
 * time -- "You are making too many requests" came back inside twenty seconds
 * of a live feed -- so the judge batches, and this is the batch.
 *
 * Returns a Map name -> true (bot) | false (person) | null (the wiki could
 * not say: missing account, throttled, network down). Null is never
 * remembered, so the next edit asks again.
 */
export async function lookupGroups(serverUrl, users, fetchFn = globalThis.fetch) {
  const names = Array.isArray(users) ? users : [users];
  const out = new Map(names.map((n) => [n, null]));
  if (!fetchFn || !names.length) return out;
  const url =
    `${serverUrl}/w/api.php?action=query&format=json&origin=*` +
    `&list=users&ususers=${encodeURIComponent(names.join('|'))}&usprop=groups`;
  try {
    const res = await fetchFn(url, { headers: UA });
    if (!res.ok) return out;
    const body = await res.json();
    const q = body && body.query;
    if (!q || !Array.isArray(q.users)) return out;
    for (const u of q.users) {
      if (!u || u.missing !== undefined || u.invalid !== undefined) continue;
      out.set(u.name, (u.groups || []).includes('bot'));
    }
  } catch (e) {
    /* throttled, offline, or not JSON: every name stays null */
  }
  return out;
}

/**
 * The global bot group, from Meta, once. A few hundred accounts that may
 * edit any wiki without a local flag.
 */
export async function lookupGlobalBots(fetchFn = globalThis.fetch) {
  const bots = new Set();
  if (!fetchFn) return bots;
  let from = '';
  try {
    for (let page = 0; page < 10; page++) {
      const url =
        'https://meta.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
        `&list=globalallusers&agugroup=global-bot&agulimit=500${from ? '&agufrom=' + encodeURIComponent(from) : ''}`;
      const res = await fetchFn(url, { headers: UA });
      if (!res.ok) break;
      const body = await res.json();
      for (const u of (body.query && body.query.globalallusers) || []) bots.add(u.name);
      from = body.continue && body.continue.agufrom;
      if (!from) break;
    }
  } catch (e) {
    /* no list: local groups still answer */
  }
  return bots;
}

/**
 * The judge. One per feed; it keeps a memory of cadence and of what each wiki
 * has said about each account, so the second edit from a name costs nothing.
 *
 * `judge(edit)` answers at once from what is in hand. When the only open
 * question is the account's group, the answer is 'unsure' with reason
 * 'unknown-account' and `settle(edit)` will ask the wiki and answer for good.
 */
export function createHumanity({
  lookup = lookupGroups,
  globalBots = lookupGlobalBots,
  now = () => Date.now(),
  window = 120_000, // the cadence window, ms
  limit = 8, // distinct pages in that window, above which no hand is at work
  cacheSize = 20_000,
  holdFor = 1200, // how long an event may wait for the wiki's answer, ms
  gather = 150, // how long names are gathered before one batched question, ms
  batch = 50, // the API's own ceiling on names per question
} = {}) {
  const groups = new Map(); // user -> true (bot) | false (person); null is never kept
  const pending = new Map(); // user -> Promise<boolean|null>
  const cadence = new Map(); // user -> [{ t, title }]
  const queues = new Map(); // serverUrl -> { names: Map<user, resolve>, timer }
  let global = null; // Set of global-bot names, once asked
  let globalAsked = false;

  function askGlobal() {
    if (globalAsked) return;
    globalAsked = true;
    Promise.resolve()
      .then(() => globalBots())
      .then((set) => {
        global = set;
      })
      .catch(() => {});
  }

  // One question per wiki per `gather` ms, up to `batch` names in it.
  function ask(serverUrl, user) {
    let q = queues.get(serverUrl);
    if (!q) {
      q = { names: new Map(), timer: 0 };
      queues.set(serverUrl, q);
    }
    const p = new Promise((resolve) => q.names.set(user, resolve));
    const flush = () => {
      q.timer = 0;
      const names = [...q.names.keys()].slice(0, batch);
      const resolvers = names.map((n) => {
        const r = q.names.get(n);
        q.names.delete(n);
        return r;
      });
      if (q.names.size) q.timer = setTimeout(flush, gather);
      Promise.resolve()
        .then(() => lookup(serverUrl, names))
        .then((answers) => {
          const map = answers instanceof Map ? answers : new Map(names.map((n) => [n, answers]));
          names.forEach((n, i) => resolvers[i](map.has(n) ? map.get(n) : null));
        })
        .catch(() => resolvers.forEach((r) => r(null)));
    };
    if (q.names.size >= batch) {
      clearTimeout(q.timer);
      flush();
    } else if (!q.timer) {
      q.timer = setTimeout(flush, gather);
    }
    return p;
  }

  function remember(user, isBot) {
    if (groups.size >= cacheSize) {
      // Drop the oldest fifth; Map iterates in insertion order.
      let n = Math.floor(cacheSize / 5);
      for (const k of groups.keys()) {
        if (n-- <= 0) break;
        groups.delete(k);
      }
    }
    groups.set(user, isBot);
  }

  function pace(user, title) {
    const t = now();
    let list = cadence.get(user);
    if (!list) {
      if (cadence.size >= 5000) {
        let n = 1000;
        for (const k of cadence.keys()) {
          if (n-- <= 0) break;
          cadence.delete(k);
        }
      }
      list = [];
      cadence.set(user, list);
    }
    while (list.length && t - list[0].t > window) list.shift();
    if (!list.some((e) => e.title === title)) list.push({ t, title });
    return list.length;
  }

  /** Normalise either backend's record to the few fields that matter. */
  function fields(d) {
    const user = d.user || '';
    return {
      user,
      wiki: d.wiki || '',
      serverUrl: d.server_url || (d.wiki ? `https://${d.wiki.replace(/wiki$/, '')}.wikipedia.org` : ''),
      bot: Boolean(d.bot || d.is_bot),
      anon: Boolean(d.is_anon) || IP_RE.test(user),
      comment: d.comment || d.parsedcomment || d.summary || '',
      title: d.title || d.page_title || '',
    };
  }

  function judge(d) {
    const f = fields(d);
    if (MACHINE_WIKIS.has(f.wiki)) return { verdict: 'machine', reason: 'wikidata' };
    if (f.bot) return { verdict: 'machine', reason: 'flag' };
    if (!f.anon && BOT_NAME_RE.test(f.user)) return { verdict: 'machine', reason: 'name' };
    if (f.user && pace(f.user, f.title) > limit) return { verdict: 'machine', reason: 'cadence' };
    if (!f.anon && (groups.get(f.user) === true || (global && global.has(f.user)))) return { verdict: 'machine', reason: 'group' };
    if (TOOL_RE.test(f.comment)) return { verdict: 'unsure', reason: 'tool' };
    if (REVERT_RE.test(f.comment)) return { verdict: 'unsure', reason: 'revert' };
    if (f.anon) return { verdict: 'human', reason: 'no-account' };
    if (!f.user) return { verdict: 'unsure', reason: 'nameless' };
    if (groups.get(f.user) === false) return { verdict: 'human', reason: 'account' };
    return { verdict: 'unsure', reason: 'unknown-account' };
  }

  /**
   * Ask the wiki about the account behind an edit, once, and answer again.
   * Resolves within `holdFor` ms whatever the network does: an unanswered
   * question is 'unsure', which is the breath, which is safe -- and it is
   * not remembered, so the account's next edit asks again.
   */
  async function settle(d) {
    const first = judge(d);
    if (first.reason !== 'unknown-account') return first;
    askGlobal();
    const f = fields(d);
    let p = pending.get(f.user);
    if (!p) {
      p = ask(f.serverUrl, f.user).then((isBot) => {
        if (isBot !== null && isBot !== undefined) remember(f.user, Boolean(isBot));
        pending.delete(f.user);
        return isBot;
      });
      pending.set(f.user, p);
    }
    let late;
    const timeout = new Promise((resolve) => { late = setTimeout(() => resolve('late'), holdFor); });
    const got = await Promise.race([p, timeout]);
    clearTimeout(late);
    if (got === 'late' || got === null || got === undefined) return { verdict: 'unsure', reason: 'unanswered' };
    return judge(d);
  }

  return {
    judge,
    settle,
    /** What the judge has learnt so far, for the dossier and the tests. */
    get known() {
      return groups.size;
    },
  };
}

/** The category a verdict becomes when only people may ring. */
export function categoryFor(verdict, anon) {
  if (verdict === 'human') return anon ? 'anon' : 'user';
  return 'bot';
}
