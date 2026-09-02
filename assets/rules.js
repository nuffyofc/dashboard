/*
 * Category taxonomy + auto-categorization rules.
 *
 * This file is deliberately separate from app.js: the categories and the
 * keyword patterns that suggest them are expected to grow as more real
 * ticket data is reviewed (see README "Extending categories"). Editing
 * this file and committing it is the whole workflow — no UI or database
 * migration needed.
 *
 * Each rule is checked against a ticket's subject + partner text. The
 * highest-scoring category above MIN_CONFIDENCE wins; otherwise the
 * ticket is left uncategorized (shown as "Uncategorized" in the table)
 * so it's visible and easy to triage by hand, rather than silently
 * mis-filed.
 *
 * Categories expanded from 6 → 15 based on analysis of aug_fromdb.xlsx
 * (417 real tickets, 100 rows sampled). Patterns derived from actual
 * summary + description text observed in the export.
 */
(function (global) {
  "use strict";

  var DEFAULT_CATEGORIES = [
    "Game Stuck",
    "Game Error",
    "Round Check",
    "Player Block",
    "Player Activity Check",
    "Win Legitimacy",
    "Win Calculation / RTP",
    "Bonus",
    "Bet Settlement",
    "Bet Limits / Config",
    "Currency Enable",
    "New Brand Setup",
    "Account Management",
    "UI Bug",
    "Payment / Denomination"
  ];

  // patterns: array of {re, weight}. Weight is summed per match; a ticket's
  // score for a category is the sum of all matching pattern weights.
  var RULES = [
    {
      // "game stuck", "stuck game round", "URGENT! GAMEART - game stuck - ..."
      // Player unable to continue playing; most common high-urgency ticket type.
      category: "Game Stuck",
      patterns: [
        { re: /\bgame\s+stuck\b/i, weight: 5 },
        { re: /\bstuck\s+game\s+round\b/i, weight: 5 },
        { re: /\bstuck\b.*\bround\b/i, weight: 4 },
        { re: /\bplayer.{0,20}(unable|can'?t|cannot)\s+continue\b/i, weight: 4 },
        { re: /\bgets?\s+stuck\b/i, weight: 4 },
        { re: /\bpending round(s)?\b/i, weight: 3 },
        { re: /\bstuck\b/i, weight: 1 }
      ]
    },
    {
      // "game error", "game_doesn't_work", "TranslatorSession error",
      // "Error on some games", "External service error", "api error",
      // "games are unavailable", "game launch issue"
      category: "Game Error",
      patterns: [
        { re: /\bgame[_\s]+(error|doesn.t.work|does.not.work|not.work)\b/i, weight: 5 },
        { re: /\bTranslatorSession\s+error\b/i, weight: 5 },
        { re: /\bExternal\s+service\s+error\b/i, weight: 4 },
        { re: /\bgame(s)?\s+(are\s+)?unavailable\b/i, weight: 4 },
        { re: /\bgame\s+launch\s+issue\b/i, weight: 4 },
        { re: /\berror\s+on\s+some\s+games\b/i, weight: 4 },
        { re: /EngML[,_\s]+game[_\s]*(error|doesn.t.work|issue)\b/i, weight: 4 },
        { re: /\bapi\s+error\b/i, weight: 2 },
        { re: /\bgame\s+(code|launch)\b/i, weight: 2 },
        { re: /\bgame\s+client\s+render/i, weight: 3 },
        { re: /\bgame\s+error\b/i, weight: 3 },
        { re: /\bFw:\s+game\s+error\b/i, weight: 5 }
      ]
    },
    {
      // "round check", "check open round", "unfinished_bet", "round_check",
      // "Check ticket N... - [Game Name]", "Roun check" (typo in real data)
      category: "Round Check",
      patterns: [
        { re: /\bround.{0,5}check\b/i, weight: 5 },
        { re: /\bcheck\s+open\s+round\b/i, weight: 5 },
        { re: /unfinished[_\s]+bet\b/i, weight: 5 },
        { re: /EngML[,_\s]+unfinished[_\s]+bet\b/i, weight: 5 },
        { re: /EngML[,_\s]+round[_\s]+check\b/i, weight: 5 },
        { re: /\bstuck\s+game\s+round\b/i, weight: 3 },
        { re: /\bround\s+id\b/i, weight: 3 },
        { re: /\bCheck\s+ticket\s+N\d/i, weight: 4 },
        { re: /\broun\s+check\b/i, weight: 4 },
        { re: /\bGA-STAGING\s+PENDING\s+ROUND\b/i, weight: 5 },
        { re: /\bauto.clos(e|ing)\s+issue\b/i, weight: 3 },
        { re: /\bvoided\s+gamerouns?\b/i, weight: 2 }
      ]
    },
    {
      // "Blocked players due to database issue", "Players are blocked",
      // "player blocked error", "Two different casinos" (auto sub-task reason),
      // "Invalid actions" (auto sub-task reason)
      category: "Player Block",
      patterns: [
        { re: /\bblocked\s+player(s)?\b/i, weight: 5 },
        { re: /\bplayer(s)?\s+are\s+blocked\b/i, weight: 5 },
        { re: /\bTwo\s+different\s+casinos\b/i, weight: 5 },
        { re: /\bInvalid\s+(custom\s+)?actions\b/i, weight: 4 },
        { re: /\bblocked\s+error\b/i, weight: 4 },
        { re: /\bplayer.{0,20}block\b/i, weight: 3 },
        { re: /reason:\s+Invalid/i, weight: 4 },
        { re: /reason:\s+Two\s+different/i, weight: 4 }
      ]
    },
    {
      // "GA player activity check", "player activity checking",
      // "(SG#...) User activity check" — investigative task for suspicious players.
      category: "Player Activity Check",
      patterns: [
        { re: /\bplayer\s+activity\s+check\b/i, weight: 5 },
        { re: /\bGA\s+player\s+activity\s+check\b/i, weight: 6 },
        { re: /\bGA8?\s+\[.*\]\s*-\s*player\s+activity\b/i, weight: 5 },
        { re: /\bplayer\s+activit(y|ies)\s+check(ing)?\b/i, weight: 5 },
        { re: /\buser\s+activity\s+check\b/i, weight: 5 },
        { re: /\bGA\s+player\s+activity\b/i, weight: 5 },
        { re: /\bGA[0-9]*\s+\w+\s+Player\s+Check\b/i, weight: 4 },
        { re: /\bplayer\s+check\b/i, weight: 3 },
        { re: /\bPlayer\s+activity\s+checking\b/i, weight: 5 },
        { re: /\bcheck\s+the\s+player.s\s+activity\b/i, weight: 4 },
        { re: /\bcheck\s+market\b/i, weight: 2 }
      ]
    },
    {
      // "please check for legitimacy", "big win verification",
      // "check legitimacy of the player's win", "regularity check",
      // "GA-big win verification-ASIA-...", "winnings legitimacy"
      category: "Win Legitimacy",
      patterns: [
        { re: /\blegitimacy\b/i, weight: 5 },
        { re: /\bbig\s+win\s+verification\b/i, weight: 6 },
        { re: /\bGA-big\s+win\s+verification\b/i, weight: 6 },
        { re: /\bregularity\s+check\b/i, weight: 5 },
        { re: /\bcheck\s+(for\s+)?legitimacy\b/i, weight: 5 },
        { re: /\bwinnings?\s+legitimacy\b/i, weight: 5 },
        { re: /\blegality\s+of\s+the\s+game\s+rounds\b/i, weight: 5 },
        { re: /\bcheck\s+legitimacy\b/i, weight: 5 },
        { re: /\bsuspicious\s+volume\b/i, weight: 4 },
        { re: /\bhigh\s+and\s+suspicious\b/i, weight: 4 },
        { re: /\bcheck\s+legality\b/i, weight: 4 },
        { re: /\bbig.?win\b/i, weight: 2 }
      ]
    },
    {
      // "RTP", "multiplier", "win verification" (technical, not fraud),
      // "symbol", large numerical win amount review
      category: "Win Calculation / RTP",
      patterns: [
        { re: /\bRTP\b/, weight: 5 },
        { re: /\bmultiplier\b/i, weight: 4 },
        { re: /\bwin\s+verification\b/i, weight: 3 },
        { re: /\bsymbol\b/i, weight: 1 },
        { re: /\bvoided\s+gamerounds?\b/i, weight: 3 }
      ]
    },
    {
      // "bonus issue", "ARB - Zeus Blitz - Bonus issue",
      // "free spins", "max exposure", "Rounds Auto-closing issue" (bonus rounds)
      category: "Bonus",
      patterns: [
        { re: /\bbonus\s+issue\b/i, weight: 5 },
        { re: /\bfree\s+spins?\b/i, weight: 5 },
        { re: /\bbonus\b/i, weight: 3 },
        { re: /\bmax\s+expo(sure)?\b/i, weight: 2 },
        { re: /\bauto.clos(e|ing)\s+issue\b/i, weight: 2 }
      ]
    },
    {
      // "bet settlement", "bet state", "no end time",
      // "In-a-Gaming: Bet status issue"
      category: "Bet Settlement",
      patterns: [
        { re: /\bbet\s+(state|settlement)\b/i, weight: 5 },
        { re: /\bbet\s+status\s+issue\b/i, weight: 5 },
        { re: /\bno\s+end\s+time\b/i, weight: 4 },
        { re: /\bplayer\s+betting\s+behaviou?r\b/i, weight: 3 }
      ]
    },
    {
      // "Change min/default bet limit", "Bet values [Partner]",
      // "Min Bet and Max Exposure", "Patagonia - Bet values..."
      category: "Bet Limits / Config",
      patterns: [
        { re: /\bbet\s+limit(s)?\b/i, weight: 5 },
        { re: /\bbet\s+values?\b/i, weight: 5 },
        { re: /\bchange\s+(min|default|max)[\s\/]+bet\b/i, weight: 5 },
        { re: /\bmin\s+bet\b/i, weight: 4 },
        { re: /\bmax\s+exposure\b/i, weight: 3 },
        { re: /\bmax\s+expo\b/i, weight: 3 },
        { re: /\bbet\s+limits?\b/i, weight: 4 }
      ]
    },
    {
      // "enable USDT/BRL/ARS/KRW/CHF/PAB/PEN currency",
      // "ENABLE CURRENCY", "TC2 currency enable request" — very frequent.
      category: "Currency Enable",
      patterns: [
        { re: /\benable\b.{0,30}\bcurrency\b/i, weight: 6 },
        { re: /\bcurrency\b.{0,30}\benable\b/i, weight: 6 },
        { re: /\bENABLE\s+CURRENCY\b/, weight: 6 },
        { re: /\bcurrency\s+enable\s+request\b/i, weight: 6 },
        { re: /\bGAS-\d+\]?:\s+enable\b/i, weight: 5 },
        { re: /\benable\b.{0,20}\b(USDT|BRL|ARS|KRW|CHF|PAB|PEN|MZN|BOB|CLP|PHP|THB|TRY|USD|EUR|GBP|MXN)\b/i, weight: 5 }
      ]
    },
    {
      // "New project activation", "new brand", "brand split",
      // "REF [GAS-...] SOFTSWISS- Gameart: new brand: ..." — very common SOFTSWISS pattern
      category: "New Brand Setup",
      patterns: [
        { re: /\bnew\s+project\s+activation\b/i, weight: 6 },
        { re: /\bnew\s+brand\b/i, weight: 5 },
        { re: /Gameart:\s+new\s+brand\b/i, weight: 6 },
        { re: /\bbrand\s+split\b/i, weight: 5 },
        { re: /SOFTSWISS.{0,20}new\s+brand\b/i, weight: 6 },
        { re: /\bnew\s+project\b/i, weight: 4 },
        { re: /\bOPS-\d+\b/i, weight: 2 },
        { re: /\bproject\s+activation\b/i, weight: 5 },
        { re: /\bnew\s+brand:\s+\w+/i, weight: 6 },
        { re: /\bGamingSoft.*brand\b/i, weight: 3 }
      ]
    },
    {
      // "reset password", "Gameart reset password", "2fa",
      // "close account", "Close Operator Accounts in Staging", "disable agent"
      category: "Account Management",
      patterns: [
        { re: /\breset\s+password\b/i, weight: 6 },
        { re: /\b2fa\b/i, weight: 5 },
        { re: /\bclose\s+(operator\s+)?account(s)?\b/i, weight: 5 },
        { re: /\bdisable\s+agent\b/i, weight: 5 },
        { re: /\bdisable\s+follow(ing)?\b/i, weight: 3 },
        { re: /\bClose\s+Operator\b/i, weight: 5 },
        { re: /\bpassword\b/i, weight: 2 },
        { re: /\bgameart\s+2fa\b/i, weight: 6 },
        { re: /\bavailability\s+check(ing)?\b/i, weight: 3 }
      ]
    },
    {
      // "Mobile UI - The setting section get cutoff",
      // "Chinese-language game icons", "layout broken", "rendering error",
      // "Games Demo Version Issue", "display issues"
      category: "UI Bug",
      patterns: [
        { re: /\blayout\b/i, weight: 3 },
        { re: /\bUI\b/, weight: 3 },
        { re: /\bdisplay(ing)?\b/i, weight: 2 },
        { re: /\bbutton\b/i, weight: 1 },
        { re: /\bnot\s+loading\b/i, weight: 3 },
        { re: /\brender(ing)?\b/i, weight: 2 },
        { re: /\bMobile\s+UI\b/i, weight: 4 },
        { re: /\bcutoff\b/i, weight: 3 },
        { re: /\blandscape\s+mode\b/i, weight: 3 },
        { re: /\bgame\s+icons?\b/i, weight: 3 },
        { re: /\bdemo\s+version\s+issue\b/i, weight: 4 },
        { re: /\bgames?\s+demo\b/i, weight: 3 }
      ]
    },
    {
      // "denomination", "precision", "currency" config (not enable),
      // "Pantaloo - GullyCricket brand split" → currency/payment config
      category: "Payment / Denomination",
      patterns: [
        { re: /\bdenomination\b/i, weight: 4 },
        { re: /\bprecision\b/i, weight: 3 },
        { re: /\bcurrency\b/i, weight: 1 },
        { re: /\b(MZN|ARS|BOB|CLP|PHP|THB|USDT|PAB|PEN|CHF|BRL|KRW|TRY|MXN|AR1)\b/, weight: 1 }
      ]
    }
  ];

  var MIN_CONFIDENCE = 0.34; // score / (score + 2) below this => uncategorized

  function suggestCategory(text) {
    if (!text) return { category: null, confidence: 0 };
    var best = null, bestScore = 0;
    RULES.forEach(function (rule) {
      var score = 0;
      rule.patterns.forEach(function (p) {
        if (p.re.test(text)) score += p.weight;
      });
      if (score > bestScore) {
        bestScore = score;
        best = rule.category;
      }
    });
    if (!best) return { category: null, confidence: 0 };
    var confidence = bestScore / (bestScore + 2);
    if (confidence < MIN_CONFIDENCE) return { category: null, confidence: confidence };
    return { category: best, confidence: confidence };
  }

  global.TicketRules = {
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    suggestCategory: suggestCategory
  };
})(window);
