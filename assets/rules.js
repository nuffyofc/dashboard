/*
 * Category taxonomy + auto-categorization rules.
 *
 * Patterns derived from full analysis of 517 real GameArt support tickets
 * (AUGFINAL.xlsx). Each pattern uses exact client-request language, not
 * generic keywords, to minimise cross-category false positives.
 *
 * Scoring: score = sum of matching pattern weights.
 * Confidence = score / (score + 2). Min confidence = 0.34 to categorize.
 * Highest-scoring category wins. Uncategorized tickets surface for manual triage.
 *
 * Edit this file to tune patterns. No migrations needed — just commit.
 */
(function (global) {
  "use strict";

  /* ----------------------------------------------------------------
   * DEFAULT CATEGORIES
   * Shown in the category dropdown on first load (before any xlsx import).
   * Ordered roughly by ticket volume based on AUGFINAL analysis.
   * ---------------------------------------------------------------- */
  var DEFAULT_CATEGORIES = [
    "Win Legitimacy",
    "Player Block",
    "Bet / Exposure Config",
    "Currency Enable",
    "Game Stuck",
    "Player Activity Check",
    "New Brand Setup",
    "Round Check",
    "Account / BO Access",
    "Game Launch Issue",
    "GGR / Reporting",
    "Bonus / Free Spins",
    "RTP Config",
    "IP Whitelist",
    "Game Bug / UI"
  ];

  /* ----------------------------------------------------------------
   * RULES
   * Each rule has: category (string) + patterns (array of {re, weight}).
   * Patterns are tested against: title + " " + description + " " + partner
   * combined into one lowercase string.
   *
   * Weight guidelines:
   *   7-8 = phrase found only in this ticket type (zero cross-fire risk)
   *   5-6 = phrase strongly associated but could appear elsewhere rarely
   *   3-4 = moderately specific phrase
   *   1-2 = generic keyword, only worth adding when supported by higher-weight hits
   * ---------------------------------------------------------------- */
  var RULES = [

    /* ── PLAYER BLOCK ─────────────────────────────────────────────
     * Auto-generated tickets when the game engine detects an invalid
     * action sequence (potential hack / cheating attempt).
     * Title format: "casino:NNNN:player:XXXXX (timestamp: ..., reason: Invalid actions, game: NNN)"
     * Description: engine log with "[ERROR] engine::actionsValidCheck Hack attempt, invalid actions"
     */
    {
      category: "Player Block",
      patterns: [
        { re: /casino:\d+:player:/i,                          weight: 8 },
        { re: /Hack attempt[,;]/i,                            weight: 7 },
        { re: /actionsValidCheck/i,                           weight: 7 },
        { re: /Invalid custom actions/i,                      weight: 7 },
        { re: /Invalid actions.*game:/i,                      weight: 7 },
        { re: /reason:\s*Invalid (custom )?actions/i,         weight: 7 },
        { re: /engine::processEngineRequest.*Hack/i,          weight: 6 },
        { re: /BLOCKED PLAYERS/i,                             weight: 6 },
        { re: /reason:\s*Two different casinos/i,             weight: 6 },
        { re: /invalid actions blocked from math/i,           weight: 6 },
        { re: /- BLOCKED$/i,                                  weight: 4 }
      ]
    },

    /* ── WIN LEGITIMACY ──────────────────────────────────────────
     * Operator asks GameArt to verify whether a large player win is
     * legitimate (no cheating, correct RNG, no forced outcomes).
     * Also covers "big win verification" and Lunar Rabbit checks.
     * Patterns use "x BET" multiplier notation that only appears in
     * game-round verification descriptions, not in engine error logs.
     */
    {
      category: "Win Legitimacy",
      patterns: [
        { re: /big.?win\s+verif/i,                            weight: 8 },
        { re: /GA-big\s+win\s+verif/i,                        weight: 8 },
        { re: /win verif/i,                                    weight: 7 },
        { re: /check.*legitimacy/i,                            weight: 7 },
        { re: /check.*legality.*round/i,                       weight: 7 },
        { re: /Gameplay\s+review/i,                            weight: 7 },
        { re: /check.*player.{0,10}win/i,                      weight: 7 },
        { re: /legitimacy\s+of\s+(the\s+)?game\s+round/i,     weight: 7 },
        { re: /regularity\s+check/i,                           weight: 7 },
        { re: /No\s+forcing\s+detected/i,                      weight: 7 }, // internal verification note
        { re: /BUYIN.{1,30}WIN.{1,40}x BET/i,                 weight: 6 }, // game-round verification format
        { re: /BET.{1,30}WIN.{1,30}x BET/i,                   weight: 6 }, // alt format (some newer tickets)
        { re: /check.*winning.*legitimate/i,                   weight: 6 },
        { re: /players?\s+using\s+VPN.*RTP/i,                  weight: 6 }, // Blackjack multipliers review
        { re: /high.*RTP.*suspicious/i,                        weight: 6 },
        { re: /suspicious.*turnover.*win/i,                    weight: 6 },
        { re: /received.*winnings.*tournament/i,               weight: 5 },
        { re: /Winning\s+verification/i,                       weight: 5 },
        { re: /verify.*winnings?\s+of\s+(user|player)/i,       weight: 6 }, // "verify the winnings of user..."
        { re: /cross\s+betting.*advantage\s+play/i,            weight: 6 }, // suspicious win review
        { re: /Verify.*information.*win/i,                     weight: 5 },
        { re: /winning.*legitimac/i,                           weight: 5 },
        { re: /please\s+check\s+legitimacy/i,                  weight: 5 },
        { re: /encountered.*error.*round\s+ID/i,               weight: 5 }, // error + round reference = win check
        { re: /legitimac/i,                                    weight: 3 }
      ]
    },

    /* ── PLAYER ACTIVITY CHECK ───────────────────────────────────
     * Operator requests a full review of a specific player's betting
     * history, usually after the player reported a large profit.
     * Very consistent title pattern: "GA player activity check - PLAYER_ID"
     */
    {
      category: "Player Activity Check",
      patterns: [
        { re: /GA\s+player\s+activity\s+check/i,              weight: 8 },
        { re: /Player\s+activity\s+check(ing)?/i,             weight: 8 },
        { re: /GA-check\s+the\s+player.{0,10}activity/i,      weight: 8 },
        { re: /User\s+activity\s+check/i,                      weight: 8 },
        { re: /GA\s*[0-9]*\s*\[.*\]\s*-\s*Player\s+activity/i, weight: 7 },
        { re: /player\s+activity\s+check(ing)?/i,             weight: 7 },
        { re: /check.*player.{0,10}activity/i,                 weight: 6 },
        { re: /player.{0,10}made\s+a\s+large\s+profit/i,      weight: 6 },
        { re: /confirm.*player.*activity/i,                    weight: 5 },
        { re: /review.*gameplay\s+activity/i,                  weight: 5 }
      ]
    },

    /* ── GAME STUCK / PENDING ROUND ──────────────────────────────
     * Player is stuck mid-game and cannot continue. Distinct from
     * "Round Check" (settlement question) — here the game session is
     * actively broken and the player is blocked from playing.
     */
    {
      category: "Game Stuck",
      patterns: [
        { re: /game\s+stuck/i,                                weight: 8 },
        { re: /PENDING\s+ROUND/i,                             weight: 7 },
        { re: /pending\s+game\s+round/i,                      weight: 7 },
        { re: /PEDNING\s+ROUND/i,                             weight: 7 }, // typo seen in real data
        { re: /resolv.*pending\s+round/i,                     weight: 7 },
        { re: /stuck\s+game\s+round/i,                        weight: 7 },
        { re: /player.*gets?\s+stuck/i,                       weight: 6 },
        { re: /unable\s+to\s+continue\s+playing/i,            weight: 6 },
        { re: /can.?t\s+continue\s+to\s+play/i,               weight: 6 },
        { re: /player.*unable.*open.*game/i,                   weight: 6 },
        { re: /manually\s+close\s+this\s+round/i,              weight: 6 },
        { re: /game.*rounds?\s+not\s+available.*stuck/i,       weight: 5 },
        { re: /stuck\s+in\s+resume/i,                          weight: 5 },
        { re: /Player.{0,20}\d+.{0,5}Stuck/i,                  weight: 6 }, // "Player 1224_949367 Stuck"
        { re: /stuck.*win/i,                                   weight: 4 }
      ]
    },

    /* ── ROUND CHECK ─────────────────────────────────────────────
     * Operator asks about a specific game round: settlement status,
     * whether the result was credited, unsettled/cancelled bets.
     * Different from Game Stuck: the game session ended but the
     * financial result is unclear or missing.
     */
    {
      category: "Round Check",
      patterns: [
        { re: /round.{0,3}check/i,                            weight: 8 },
        { re: /EngML.*round.?check/i,                          weight: 8 },
        { re: /GABBCUS.*round.?check/i,                        weight: 8 },
        { re: /Bet\s+State\s+Issue/i,                          weight: 8 },
        { re: /Unsettled\s+bets?/i,                            weight: 8 },
        { re: /unsettled\s+round/i,                            weight: 7 },
        { re: /rounds?\s+not\s+settled/i,                      weight: 7 },
        { re: /unfinished.?bet/i,                              weight: 7 },
        { re: /EngML.*unfinished.?bet/i,                        weight: 8 },
        { re: /check.*open\s+round/i,                          weight: 7 },
        { re: /round.*reply\s+error/i,                         weight: 7 },
        { re: /round.*was\s+not\s+completed/i,                 weight: 6 },
        { re: /cancelled\s+bets?/i,                            weight: 6 },
        { re: /round.*id.*not\s+settled/i,                     weight: 6 },
        { re: /check.*results?\s+of.*rounds?/i,                weight: 6 },
        { re: /round.*still\s+open/i,                          weight: 6 },
        { re: /\bcheck\s+rounds?\b/i,                           weight: 6 }, // "Check rounds" title
        { re: /check.*mentioned.*rounds?/i,                    weight: 6 }, // "check the mentioned rounds"
        { re: /check.*rounds?\s+(listed|below|above)/i,        weight: 6 }, // "rounds listed below were not settled"
        { re: /does\s+not\s+return\s+rounds?/i,                weight: 7 }, // "Gameart does not return rounds"
        { re: /rounds?\s+listed\s+below\s+were\s+not\s+settled/i, weight: 7 }, // verbatim match
        { re: /round\s+id.*settled/i,                          weight: 5 }
      ]
    },

    /* ── CURRENCY ENABLE ─────────────────────────────────────────
     * Request to enable one or more new currencies for an existing casino.
     * Uses very specific client-request phrases to avoid matching
     * New Brand Setup descriptions (which also list currencies).
     */
    {
      category: "Currency Enable",
      patterns: [
        { re: /enable\s+\w+\s+currency\s+for\s+casino/i,      weight: 8 }, // "enable BTC currency for casino_id: topx"
        { re: /enable\s+\w+\s+currenc(y|ies)\s+for\s+casino_id/i, weight: 8 },
        { re: /GAS-\d+\]?:\s+enable\b/i,                      weight: 8 }, // SOFTSWISS ticket reference format
        { re: /enable\s+(multiple\s+)?currencies\s+for\s+casino/i, weight: 8 },
        { re: /New\s+currencies?\s+addition/i,                  weight: 8 }, // Digitain pattern
        { re: /currencies?\s+addition:/i,                       weight: 7 },
        { re: /activate.{0,20}currencies?\s+for/i,              weight: 7 },
        { re: /could\s+you\s+please\s+activate\s+the\s+mentioned\s+currencies/i, weight: 7 },
        { re: /add\s+currencies?\s+for\s+casino/i,              weight: 7 },
        { re: /confirm\s+if\s+you\s+support.*currencies.*enable/i, weight: 6 },
        { re: /if\s+yes\s+please\s+enable\s+to\s+us/i,          weight: 6 }, // GoldenMatrix pattern
        { re: /enable\s+to\s+us.*currenc/i,                     weight: 6 },
        { re: /ENABLE\s+CURRENCY/,                              weight: 8 }  // explicit title
      ]
    },

    /* ── NEW BRAND SETUP ─────────────────────────────────────────
     * Request to onboard a new casino / brand onto GameArt's servers.
     * Dominated by SOFTSWISS bulk requests: "REF [GAS-NNNNNN] SOFTSWISS- Gameart: new brand: NAME"
     * Also Digitain "New project activation" tickets.
     */
    {
      category: "New Brand Setup",
      patterns: [
        { re: /SOFTSWISS.{0,20}Gameart:\s*new\s+brands?:/i,   weight: 8 },
        { re: /REF\s+\[GAS-\d+\]\s+SOFTSWISS/i,              weight: 8 },
        { re: /new\s+brands?:\s+\w+/i,                         weight: 7 },
        { re: /new\s+project\s+activation/i,                   weight: 8 },
        { re: /Gameart:\s*New\s+projects?:/i,                  weight: 8 },
        { re: /Please\s+connect\s+the\s+casino\s+to/i,        weight: 7 },
        { re: /casino_id\s*=\s*partner_id\s*-\s*\w+/i,        weight: 7 }, // SOFTSWISS internal format
        { re: /Server:\s+Softswiss.*GA\d/i,                   weight: 7 },
        { re: /brand\s+split\s+access/i,                       weight: 6 },
        { re: /two\s+groups\s+of\s+split\s+access/i,           weight: 7 },
        { re: /GAS-\d+\].*new\s+brand/i,                       weight: 7 },
        { re: /new\s+brand/i,                                  weight: 3 }
      ]
    },

    /* ── BET / EXPOSURE CONFIG ───────────────────────────────────
     * Request to change bet limits (min/max/default), maximum exposure,
     * or maximum winning amounts for a specific casino configuration.
     * Uses capitalized "Min bet:" / "Max bet:" as seen in real requests.
     */
    {
      category: "Bet / Exposure Config",
      patterns: [
        { re: /Min\s+[Bb]et\s*:/,                             weight: 8 }, // "Min bet: 100 CLP"
        { re: /Max\s+[Bb]et\s*:/,                             weight: 8 },
        { re: /Max\s+winning\s*:/i,                            weight: 8 },
        { re: /change\s+the\s+default\s+bet\s+to/i,           weight: 8 },
        { re: /default\s+bet\s+(is|to)\s+(too?\s+low|\d)/i,   weight: 7 },
        { re: /please\s+(change|set)\s+(the\s+)?default\s+bet/i, weight: 7 },
        { re: /Exposure\s+Limits?\s+Game\s+Art/i,              weight: 8 },
        { re: /exposure\s+limit/i,                             weight: 7 },
        { re: /changing\s+the\s+maximum\s+bonus\s+game\s+purchase/i, weight: 8 },
        { re: /\[GAS-\d+\]:?\s+Default\s+bet\b/i,              weight: 8 }, // SOFTSWISS "[GAS-NNNNNN]: Default bet"
        { re: /\[GAS-\d+\]:?\s+Min(imum)?\s+bet\b/i,           weight: 8 },
        { re: /Default\s+bet\s+[\d.,]+\s+[A-Z]{3}\b/,          weight: 7 }, // "Default bet 1.5 EUR"
        { re: /default\s+bet\s+for\s+casino/i,                 weight: 7 },
        { re: /max.?expo(sure)?\s+set\s+up\s+for/i,            weight: 6 },
        { re: /bet\s+values?\b/i,                              weight: 6 },
        { re: /bet\s+limit(s)?\b/i,                            weight: 6 },
        { re: /\[GAS-\d+\]:?\s+limits?\s+for/i,                weight: 8 }, // SOFTSWISS "[GAS-NNNNNN]: limits for"
        { re: /min\s+bet\b/i,                                  weight: 4 },
        { re: /max\s+bet\b/i,                                  weight: 4 },
        { re: /default\s+bet\b/i,                              weight: 4 }
      ]
    },

    /* ── RTP CONFIG ──────────────────────────────────────────────
     * Request to set a specific RTP percentage for a casino.
     * Separate from Win Legitimacy (which checks if a win was fair)
     * and from New Brand Setup (where RTP is one line in a larger setup).
     */
    {
      category: "RTP Config",
      patterns: [
        { re: /Please\s+set\s+RTP\s+to\s+\d+%/i,             weight: 8 },
        { re: /RTP\s+for\s+casino_?id/i,                      weight: 8 },
        { re: /\[GAS-\d+\]?:?\s+RTP\b/i,                     weight: 8 }, // SOFTSWISS "[GAS-203339]: RTP"
        { re: /set\s+RTP.*%.*for.*casino/i,                   weight: 7 },
        { re: /low\s+RTP\s+access/i,                          weight: 8 }, // "Production low RTP access"
        { re: /RTP\s+to\s+\d+%/i,                             weight: 6 }
      ]
    },

    /* ── GAME LAUNCH ISSUE ───────────────────────────────────────
     * Game fails to load / launch for players or operators.
     * Distinct from Game Stuck (mid-session freeze) and Game Bug (visual).
     */
    {
      category: "Game Launch Issue",
      patterns: [
        { re: /Provider.{0,10}launch\s+issue/i,               weight: 8 },
        { re: /launch\s+issue(s)?/i,                           weight: 7 },
        { re: /launching\s+issues?/i,                          weight: 7 },
        { re: /game.*is\s+not\s+loading\s+correctly/i,        weight: 8 },
        { re: /game.*not\s+loading/i,                          weight: 7 },
        { re: /game.*loading.*error/i,                         weight: 7 },
        { re: /games?.*not\s+working/i,                        weight: 7 },
        { re: /game.*doesn.t\s+work/i,                         weight: 7 },
        { re: /game_doesn.t_work/i,                            weight: 7 },
        { re: /games?\s+get\s+stuck\s+in\s+loading/i,         weight: 7 },
        { re: /not\s+loading.*complete\s+launching/i,          weight: 7 },
        { re: /do\s+not.*complete\s+launching/i,               weight: 7 }, // "do not complete launching"
        { re: /not.*complete\s+launching/i,                    weight: 6 },
        { re: /games?\s+unavailable/i,                         weight: 6 },
        { re: /game\s+list\s+is\s+not\s+available/i,           weight: 7 }, // "game list is not available"
        { re: /slot.*malfunction|malfunction.*slot/i,           weight: 6 }, // "report slot malfunction"
        { re: /unable\s+to.*test.*games?.*loading/i,           weight: 6 },
        { re: /game.*giving.*message.*Hypergaming/i,           weight: 7 }, // specific Skillonnet error
        { re: /game\s+launch\s+issue/i,                        weight: 7 },
        { re: /error.*game\s+launch/i,                         weight: 6 },
        { re: /Game\s+Launch\s+Issue\b/i,                      weight: 8 }, // exact title match
        { re: /TranslatorSession\s+error/i,                    weight: 7 },
        { re: /game.*loading.*error/i,                         weight: 6 },
        { re: /504\s+error.*game/i,                            weight: 5 },
        { re: /no\s+URL\s+is\s+returned.*launch/i,             weight: 7 }, // ZENITH game launch API returns no URL
        { re: /attempt\s+to\s+launch.*no\s+URL/i,              weight: 7 }

      ]
    },

    /* ── IP WHITELIST ─────────────────────────────────────────────
     * Request to add one or more IP addresses to the whitelist
     * (API access, backoffice access, or game launch permissions).
     */
    {
      category: "IP Whitelist",
      patterns: [
        { re: /WL\s+IPS?\s+FOR/i,                             weight: 8 },
        { re: /Please\s+(WL|whitelist)\s+the\s+(following\s+)?IP/i, weight: 8 },
        { re: /whitelist\s+the\s+following\s+IPs?/i,          weight: 8 },
        { re: /whitelist\s+this\s+IP/i,                        weight: 8 },
        { re: /add.*IP.*whitelist/i,                           weight: 7 },
        { re: /whitelist.*IPs?\s+on\s+(prod|production|PROD)/i, weight: 7 },
        { re: /ip\s+whitelist/i,                               weight: 7 },
        { re: /whitelist.*IP/i,                                weight: 5 },
        { re: /permission\s+denied\s+from\s+this\s+ip/i,      weight: 6 }
      ]
    },

    /* ── ACCOUNT / BO ACCESS ─────────────────────────────────────
     * Backoffice account management: password reset, 2FA setup/reset,
     * new BO credentials, unlocking accounts.
     */
    {
      category: "Account / BO Access",
      patterns: [
        { re: /reset\s+password/i,                             weight: 8 },
        { re: /reset\s+back.office\s+credentials?/i,           weight: 8 },
        { re: /reset.*BO.*credentials?/i,                      weight: 8 },
        { re: /please\s+reset\s+password\s+for/i,              weight: 8 },
        { re: /Request\s+to\s+Unlock.*Account.*Reset\s+Password/i, weight: 8 },
        { re: /two.factor\s+authentication.*not\s+linked/i,    weight: 8 },
        { re: /BO\s+2FA\s+Issue/i,                             weight: 8 },
        { re: /2FA.*not\s+linked\s+during\s+account/i,         weight: 7 },
        { re: /Reset\s+2FA\s+request/i,                        weight: 8 },
        { re: /new\s+access\s+credentials?\s+or\s+restore/i,   weight: 7 },
        { re: /receive\s+new\s+access\s+credentials?/i,        weight: 7 },
        { re: /access\s+to\s+the\s+BO/i,                       weight: 7 },
        { re: /BO\s+credentials?\s+expired/i,                  weight: 7 },
        { re: /check.*credentials.*valid/i,                    weight: 6 },
        { re: /credentials.*\{.*invalid\}/i,                   weight: 6 },
        { re: /close\s+operator\s+accounts?/i,                 weight: 7 }, // "Close Operator Accounts in Staging"
        { re: /disable.*following\s+agent/i,                   weight: 7 },
        { re: /\bBO\s+access\b/i,                              weight: 6 }, // "BO access for support agents"
        { re: /access.*backoffice/i,                           weight: 5 },
        { re: /please\s+give\s+us\s+access\s+to\s+the\s+BO/i, weight: 7 },
        { re: /reset.*back.office.*credentials/i,              weight: 7 },
        { re: /unable\s+access\s+Game\s+Art\s+backend/i,       weight: 7 },
        { re: /\b2FA\b/,                                       weight: 4 },
        { re: /reset\s+password/i,                             weight: 5 }
      ]
    },

    /* ── GGR / REPORTING ─────────────────────────────────────────
     * Discrepancies between GameArt's Back Office reports and the
     * operator's own records. Includes missing rounds, reconciliation
     * mismatches, GGR calculation errors.
     */
    {
      category: "GGR / Reporting",
      patterns: [
        { re: /Discrepanc(y|ies)\s+in\s+reports?/i,           weight: 8 },
        { re: /BO\s+discrepancy/i,                             weight: 8 },
        { re: /winnings?\s+not\s+included\s+in\s+(the\s+)?GGR/i, weight: 8 },
        { re: /Missing\s+Vendor\s+Data/i,                      weight: 8 },
        { re: /Incorrect.*player\s+bet\s+amount.*report/i,     weight: 8 },
        { re: /reconciliation\s+API/i,                          weight: 7 },
        { re: /rounds?\s+absent\s+in\s+your\s+BO/i,            weight: 7 },
        { re: /data\s+deletion\s+issue/i,                       weight: 7 },
        { re: /not\s+included\s+in\s+the\s+invoice/i,          weight: 7 },
        { re: /report.*mismatches?/i,                           weight: 6 },
        { re: /vendor.*under.reports?\s+round/i,                weight: 7 },
        { re: /discrepanc/i,                                   weight: 4 },
        { re: /\bGGR\b/,                                       weight: 4 }
      ]
    },

    /* ── BONUS / FREE SPINS ──────────────────────────────────────
     * Bonus round issues, free spin configuration requests, game crash
     * specifically during a bonus round, voided game rounds.
     * Uses "free spin" (with space) to avoid matching "freespins" JSON
     * embedded in engine error logs.
     */
    {
      category: "Bonus / Free Spins",
      patterns: [
        { re: /free\s+spin\s+configuration\s+request/i,        weight: 8 },
        { re: /endpoint\s+for\s+creating\s+free\s+spins?/i,    weight: 8 },
        { re: /free\s+spin\s+amounts?\s+are\s+up\s+to\s+date/i, weight: 8 },
        { re: /Bonus\s+issue/i,                                 weight: 7 },
        { re: /Crashing\s+at\s+Playing.*During\s+Bonus\s+Round/i, weight: 8 },
        { re: /crash.*bonus\s+round/i,                          weight: 7 },
        { re: /bonus\s+round.*crash/i,                          weight: 7 },
        { re: /Zeus\s+Blitz.*Bonus/i,                           weight: 7 },
        { re: /voided\s+gamerouns?/i,                           weight: 6 },
        { re: /Stuck\s+Bonus\s+Round/i,                         weight: 7 },
        { re: /missing\s+winnings.*bonus/i,                     weight: 6 },
        { re: /free\s+spins?\s+feature/i,                       weight: 5 },
        { re: /free\s+spins?\s+(config|endpoint|request|via)/i, weight: 6 },
        { re: /implement.*free\s+spins?\s+via\s+API/i,          weight: 7 },
        { re: /free\s+spins?\s+via\s+API/i,                     weight: 7 },
        { re: /purchasing\s+a.*bonus|bonus.*purchase/i,          weight: 5 }, // bonus purchase session interrupted
        { re: /\bbonus\b/i,                                     weight: 2 } // low weight — appears everywhere
      ]
    },

    /* ── GAME BUG / UI ───────────────────────────────────────────
     * Visual bugs, display errors, unsupported browser issues,
     * game result rendering errors, replay video discrepancies.
     * Lower volume but distinct from launch issues.
     */
    {
      category: "Game Bug / UI",
      patterns: [
        { re: /Mobile\s+UI.*cutoff/i,                          weight: 8 },
        { re: /landscape\s+mode.*cutoff/i,                     weight: 7 },
        { re: /bar.*replay\s+video.*different/i,                weight: 8 },
        { re: /4th\s+part\s+of\s+the\s+bar.*different\s+colou?r/i, weight: 8 },
        { re: /game\s+result\s+error/i,                         weight: 7 },
        { re: /Game\s+Result\s+Error\s+in\s+Prod/i,             weight: 8 },
        { re: /supported\s+browsers?/i,                         weight: 7 }, // "ALL GAMES - SUPPORTED BROWSERS"
        { re: /Please\s+choose\s+a\s+supported\s+browser/i,    weight: 7 },
        { re: /EntertainmentArt.*Game\s+Issues/i,               weight: 6 },
        { re: /demo\s+mode.*games?\s+not\s+working.*black\s+screen/i, weight: 7 },
        { re: /games?\s+not\s+loading.*incognito/i,             weight: 7 },
        { re: /raw\s+currency\s+code.*lobby/i,                  weight: 7 }, // game client renders raw currency code
        { re: /Erorr\s+with\s+the\s+games?/i,                   weight: 6 }, // typo in real ticket
        { re: /\bUI\b/,                                         weight: 2 }
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
