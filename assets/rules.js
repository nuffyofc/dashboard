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
 */
(function (global) {
  "use strict";

  // Seeded from Tickets_Miha_1_jul_aug.xlsx, sheet "LISTS".
  var DEFAULT_CATEGORIES = [
    "UI Bug",
    "Game Issue",
    "Bet Settlement",
    "Win Calculation",
    "Bonus",
    "Payment"
  ];

  // patterns: array of {re, weight}. Weight is summed per match; a ticket's
  // score for a category is the sum of all matching pattern weights.
  var RULES = [
    {
      category: "UI Bug",
      patterns: [
        { re: /\blayout\b/i, weight: 2 },
        { re: /\bicon(s)?\b/i, weight: 1 },
        { re: /\bdisplay(ing)?\b/i, weight: 1 },
        { re: /\bbutton\b/i, weight: 1 },
        { re: /\bnot loading\b/i, weight: 2 },
        { re: /\brender(ing)?\b/i, weight: 1 },
        { re: /\bUI\b/, weight: 2 }
      ]
    },
    {
      category: "Game Issue",
      patterns: [
        { re: /\bgame (stuck|error|launch|code)\b/i, weight: 3 },
        { re: /\bstuck round\b/i, weight: 3 },
        { re: /\bpending round(s)?\b/i, weight: 2 },
        { re: /\bexternal service error\b/i, weight: 2 },
        { re: /\bapi error\b/i, weight: 1 },
        { re: /\bgame launch issue\b/i, weight: 3 }
      ]
    },
    {
      category: "Bet Settlement",
      patterns: [
        { re: /\bbet (state|limits?|settlement)\b/i, weight: 3 },
        { re: /\bround.?(id|check)\b/i, weight: 2 },
        { re: /\bplayer activity check\b/i, weight: 2 },
        { re: /\bplayer betting behaviou?r\b/i, weight: 2 },
        { re: /\bno end time\b/i, weight: 2 }
      ]
    },
    {
      category: "Win Calculation",
      patterns: [
        { re: /\bRTP\b/, weight: 3 },
        { re: /\bmultiplier\b/i, weight: 2 },
        { re: /\bwin verification\b/i, weight: 3 },
        { re: /\bwinnings? legitimacy\b/i, weight: 3 },
        { re: /\bbig.?win\b/i, weight: 2 },
        { re: /\bsymbol\b/i, weight: 1 }
      ]
    },
    {
      category: "Bonus",
      patterns: [
        { re: /\bfree spins?\b/i, weight: 3 },
        { re: /\bbonus\b/i, weight: 3 },
        { re: /\bmax expo(sure)?\b/i, weight: 1 }
      ]
    },
    {
      category: "Payment",
      patterns: [
        { re: /\benable\b.*\bcurrency\b/i, weight: 3 },
        { re: /\bcurrency\b/i, weight: 1 },
        { re: /\bMZN|ARS|BOB|CLP|PHP|THB|USDT|PAB|PEN|CHF\b/, weight: 1 },
        { re: /\bdenomination\b/i, weight: 2 },
        { re: /\bprecision\b/i, weight: 1 }
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
    // Simple diminishing-returns confidence curve: 0 matches -> 0,
    // heavier/multiple matches climb toward 1 without ever quite reaching it.
    var confidence = bestScore / (bestScore + 2);
    if (confidence < MIN_CONFIDENCE) return { category: null, confidence: confidence };
    return { category: best, confidence: confidence };
  }

  global.TicketRules = {
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    suggestCategory: suggestCategory
  };
})(window);
