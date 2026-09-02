(function () {
  "use strict";

  var LS_RAW = "bossTable.raw.v1";
  var LS_OVERRIDES = "bossTable.overrides.v1";
  var LS_CATEGORIES = "bossTable.categories.v1";

  // -----------------------------------------------------------------
  // Column alias tables — flexible header matching across the shapes
  // we know about (Zendesk CSV, Jira/aug_fromdb XLSX, Slovenian variants).
  // All lookups are done on lowercased-trimmed header strings.
  // -----------------------------------------------------------------
  var ALIASES = {
    key:        ["id", "ticket id", "#", "key", "issue key", "ticket key", "ticket_key", "jira key"],
    url:        ["url jira", "jira url", "url"],
    status:     ["ticket status", "status", "stanje"],
    subject:    ["subject", "summary", "title", "naslov"],
    subjectFallback: ["product"],
    description:["description", "opis", "body", "details", "comment"],
    issueType:  ["issue_type", "issue type", "type", "issuetype"],
    partner:    ["requester", "customer", "requested by", "reporter", "partner", "stranka",
                 "partner_name", "casino_id", "casino id", "partner name"],
    partnerSuggestion: ["partner_name_suggestion_for_review"],
    priority:   ["priority", "prioriteta"],
    created:    ["requested", "created", "request date", "created date", "ustvarjen", "created_at"],
    updated:    ["updated", "last updated", "updated at", "posodobljen", "updated_at"],
    resolved:   ["resolved", "resolved at", "resolution date", "rešen", "resen", "resolved_at"],
    nextAction: ["next action", "next steps", "naslednji korak"]
  };

  function findCol(headers, names) {
    for (var n = 0; n < names.length; n++) {
      for (var i = 0; i < headers.length; i++) {
        if (headers[i] === names[n]) return headers[i];
      }
    }
    return null;
  }

  function parseDate(raw) {
    if (!raw) return null;
    var t = String(raw).trim();
    if (!t || t === "-" || t === "'-") return null;
    // Handle "2026-08-02 08:00:28" format from Jira DB export
    var d = new Date(t.replace(" ", "T"));
    if (!isNaN(d.getTime())) return d;
    d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }

  function extractKeyFromUrl(url) {
    if (!url) return null;
    var m = String(url).match(/[A-Z][A-Z0-9]+-\d+/);
    return m ? m[0] : null;
  }

  function cleanPriority(raw) {
    var p = (raw || "").toString().trim();
    if (p.charAt(0) === "'") p = p.slice(1).trim();
    if (!p || p === "-") return null;
    return p;
  }

  // -----------------------------------------------------------------
  // Import: SheetJS reads both .csv and .xlsx into the same row-object
  // shape, so one normalizer handles both source formats.
  // -----------------------------------------------------------------
  function rowsFromWorkbook(wb) {
    var sheetName = wb.SheetNames[0];
    var sheet = wb.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  }

  function normalizeRows(objRows) {
    if (!objRows.length) return [];
    var rawHeaders = Object.keys(objRows[0]);
    var headerMap = {}; // lowercased-trimmed -> original key
    rawHeaders.forEach(function (h) {
      headerMap[h.trim().toLowerCase()] = h;
    });
    var lowerHeaders = Object.keys(headerMap);

    var col = {
      key:              findCol(lowerHeaders, ALIASES.key),
      url:              findCol(lowerHeaders, ALIASES.url),
      status:           findCol(lowerHeaders, ALIASES.status),
      subject:          findCol(lowerHeaders, ALIASES.subject),
      subjectFallback:  findCol(lowerHeaders, ALIASES.subjectFallback),
      description:      findCol(lowerHeaders, ALIASES.description),
      issueType:        findCol(lowerHeaders, ALIASES.issueType),
      partner:          findCol(lowerHeaders, ALIASES.partner),
      partnerSuggestion:findCol(lowerHeaders, ALIASES.partnerSuggestion),
      priority:         findCol(lowerHeaders, ALIASES.priority),
      created:          findCol(lowerHeaders, ALIASES.created),
      updated:          findCol(lowerHeaders, ALIASES.updated),
      resolved:         findCol(lowerHeaders, ALIASES.resolved),
      nextAction:       findCol(lowerHeaders, ALIASES.nextAction)
    };

    var out = [];
    objRows.forEach(function (row, idx) {
      function g(colKey) {
        var orig = col[colKey] ? headerMap[col[colKey]] : null;
        if (!orig) return "";
        var v = row[orig];
        return v === undefined || v === null ? "" : String(v).trim();
      }

      var idRaw  = g("key");
      var urlRaw = g("url");
      var partnerRaw = g("partner") || g("partnerSuggestion");
      var subjectRaw = g("subject") || g("subjectFallback");

      if (!idRaw && !urlRaw && !partnerRaw && !subjectRaw) return;

      var key = idRaw || extractKeyFromUrl(urlRaw) || "";
      if (!key) key = "row-" + (idx + 1);

      var subject  = subjectRaw || "(brez naslova)";
      var descFull = g("description");
      // Truncate to 600 chars for storage efficiency; enough for categorization and preview.
      var description = descFull.slice(0, 600);

      out.push({
        key:              key,
        status:           g("status") || "—",
        subject:          subject,
        description:      description,
        issueType:        g("issueType") || "",
        partner:          partnerRaw || "—",
        priority:         cleanPriority(g("priority")),
        createdRaw:       g("created"),
        createdDate:      parseDate(g("created")),
        updatedRaw:       g("updated"),
        updatedDate:      parseDate(g("updated")),
        resolvedRaw:      g("resolved"),
        resolvedDate:     parseDate(g("resolved")),
        importedNextAction: g("nextAction") || ""
      });
    });
    return out;
  }

  // -----------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------
  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage full — state still works for this session */
    }
  }

  // -----------------------------------------------------------------
  // State
  // -----------------------------------------------------------------
  var state = {
    tickets: [],
    filename: null,
    loadedAt: null,
    overrides: {},
    categories: [],
    sortKey: "idleDays",
    sortDir: "desc",
    filters: { status: "", category: "", partner: "", subject: "", key: "" },
    globalSearch: "",
    groupBy: "none",
    collapsedGroups: {}
  };

  var COLUMNS = [
    { key: "key",           label: "ID",          type: "str" },
    { key: "status",        label: "Status",       type: "str" },
    { key: "subject",       label: "Naslov",       type: "str" },
    { key: "partnerShown",  label: "Partner",      type: "str" },
    { key: "categoryShown", label: "Kategorija",   type: "str" },
    { key: "nextActionShown",label: "Next action", type: "str" },
    { key: "createdDate",   label: "Ustvarjen",    type: "date" },
    { key: "updatedDate",   label: "Posodobljen",  type: "date" },
    { key: "ageDays",       label: "Age",          type: "num" },
    { key: "idleDays",      label: "Idle",         type: "num" }
  ];

  function daysBetween(then, now) {
    if (!then) return null;
    return (now - then.getTime()) / 86400000;
  }

  function overrideFor(key) {
    return state.overrides[key] || null;
  }

  function withDerived(list, now) {
    return list.map(function (t) {
      var ov = overrideFor(t.key);
      var categoryName       = ov && ov.category !== undefined ? ov.category : null;
      var categorySource     = ov ? ov.categorySource : null;
      var partnerShown       = (ov && ov.partnerOverride) ? ov.partnerOverride : t.partner;
      var nextActionShown    = (ov && ov.nextAction !== undefined && ov.nextAction !== "")
                                 ? ov.nextAction : t.importedNextAction;
      var resTime = (t.createdDate && t.resolvedDate)
                    ? daysBetween(t.createdDate, t.resolvedDate.getTime()) : null;
      return Object.assign({}, t, {
        ageDays:           daysBetween(t.createdDate, now),
        idleDays:          daysBetween(t.updatedDate, now),
        resolutionDays:    resTime,
        categoryShown:     categoryName || "Uncategorized",
        categorySource:    categorySource,
        categoryConfidence:ov ? ov.categoryConfidence : null,
        partnerShown:      partnerShown,
        nextActionShown:   nextActionShown
      });
    });
  }

  // -----------------------------------------------------------------
  // Auto-categorization — runs on every ticket that isn't manually set.
  // Uses subject + description + partner for richer signal matching.
  // -----------------------------------------------------------------
  function applyAutoCategorization(tickets) {
    tickets.forEach(function (t) {
      var existing = state.overrides[t.key];
      if (existing && existing.categorySource === "manual") return;

      // Compose categorization text: subject is most reliable signal,
      // description adds context (first 400 chars), partner adds partner-specific clues.
      var catText = [
        t.subject,
        (t.description || "").slice(0, 400),
        t.partner
      ].join(" ");

      var suggestion = window.TicketRules.suggestCategory(catText);
      state.overrides[t.key] = Object.assign({}, existing, {
        category:           suggestion.category,
        categorySource:     "auto",
        categoryConfidence: suggestion.confidence,
        partnerOverride:    existing ? existing.partnerOverride : undefined,
        nextAction:         existing ? existing.nextAction : (t.importedNextAction || undefined),
        updatedAt:          existing ? existing.updatedAt : null
      });
      if (suggestion.category && state.categories.indexOf(suggestion.category) === -1) {
        state.categories.push(suggestion.category);
      }
    });
    saveJSON(LS_OVERRIDES, state.overrides);
    saveJSON(LS_CATEGORIES, state.categories);
  }

  // -----------------------------------------------------------------
  // Filtering / sorting / grouping
  // -----------------------------------------------------------------
  function getFiltered(now) {
    var withD = withDerived(state.tickets, now);
    var f = state.filters;
    var q = state.globalSearch.trim().toLowerCase();
    var terms = q ? q.split(/\s+/) : [];
    return withD.filter(function (t) {
      if (f.status   && t.status !== f.status)                                               return false;
      if (f.category && t.categoryShown !== f.category)                                      return false;
      if (f.partner  && t.partnerShown.toLowerCase().indexOf(f.partner.toLowerCase()) === -1) return false;
      if (f.subject  && t.subject.toLowerCase().indexOf(f.subject.toLowerCase()) === -1)     return false;
      if (f.key      && t.key.toLowerCase().indexOf(f.key.toLowerCase()) === -1)             return false;
      if (terms.length) {
        var hay = [t.key, t.status, t.subject, t.partnerShown, t.categoryShown,
                   t.nextActionShown, t.priority || "", t.description || ""]
                    .join(" ").toLowerCase();
        for (var i = 0; i < terms.length; i++) {
          if (hay.indexOf(terms[i]) === -1) return false;
        }
      }
      return true;
    });
  }

  function sortRows(list) {
    var key = state.sortKey, dir = state.sortDir === "asc" ? 1 : -1;
    var col = COLUMNS.filter(function (c) { return c.key === key; })[0] || { type: "str" };
    return list.slice().sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (col.type === "date") {
        av = av ? av.getTime() : -Infinity;
        bv = bv ? bv.getTime() : -Infinity;
      } else if (col.type === "num") {
        av = (av === null || av === undefined) ? -Infinity : av;
        bv = (bv === null || bv === undefined) ? -Infinity : bv;
      } else {
        av = (av || "").toLowerCase();
        bv = (bv || "").toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  function isoWeekLabel(d) {
    var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - day + 3);
    var firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    var week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return date.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
  }

  function groupKeyFor(t) {
    switch (state.groupBy) {
      case "partner":  return t.partnerShown || "—";
      case "category": return t.categoryShown || "Uncategorized";
      case "day":      return t.createdDate ? t.createdDate.toISOString().slice(0, 10) : "brez datuma";
      case "week":     return t.createdDate ? isoWeekLabel(t.createdDate) : "brez datuma";
      case "month":    return t.createdDate ? t.createdDate.toISOString().slice(0, 7) : "brez datuma";
      default:         return null;
    }
  }

  function buildGroups(sorted) {
    var groups = {}, order = [];
    sorted.forEach(function (t) {
      var k = groupKeyFor(t);
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(t);
    });
    order.sort(function (a, b) { return groups[b].length - groups[a].length; });
    return order.map(function (k) {
      var rows = groups[k];
      var withRes  = rows.filter(function (r) { return r.resolutionDays !== null; });
      var avgRes   = withRes.length
        ? withRes.reduce(function (s, r) { return s + r.resolutionDays; }, 0) / withRes.length : null;
      var idleRows = rows.filter(function (r) { return r.idleDays !== null; });
      var avgIdle  = idleRows.length
        ? idleRows.reduce(function (s, r) { return s + r.idleDays; }, 0) / idleRows.length : null;
      return { key: k, rows: rows, count: rows.length, avgRes: avgRes, avgIdle: avgIdle };
    });
  }

  // -----------------------------------------------------------------
  // Rendering helpers
  // -----------------------------------------------------------------
  var els = {};
  function cacheEls() {
    ["summaryStrip", "globalSearch", "groupBy", "headerRow", "filterRow", "tableBody",
     "shownCount", "totalCount", "loadMeta", "loadBtn", "fileInput", "dropZone",
     "newCatInput", "addCatBtn"].forEach(function (id) {
      els[id] = document.getElementById(id);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtDays(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return Math.round(v) + "d";
  }

  function fmtDateShort(d) {
    if (!d) return "—";
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function fmtDateFull(d) {
    if (!d) return "—";
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
           " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function relTime(ms) {
    if (!ms && ms !== 0) return "";
    var s = Math.round((Date.now() - ms) / 1000);
    if (s < 60)   return "pravkar";
    var m = Math.round(s / 60);
    if (m < 60)   return m + "min";
    var h = Math.round(m / 60);
    if (h < 24)   return h + "h";
    var d = Math.round(h / 24);
    if (d < 30)   return d + "d";
    var mo = Math.round(d / 30);
    return mo + "mo";
  }

  function relTimeFromDate(d) {
    if (!d) return "";
    return relTime(d.getTime());
  }

  function statusClass(status) {
    var s = (status || "").toLowerCase();
    if (s === "done" || s === "solved" || s === "closed" || s === "resolved") return "t-done";
    if (s === "to do" || s === "new" || s === "open")                         return "t-open";
    if (s.indexOf("progress") !== -1 || s.indexOf("pending") !== -1 ||
        s.indexOf("waiting") !== -1  || s.indexOf("in review") !== -1)        return "t-todo";
    if (s === "blocked" || s === "on hold")                                   return "t-bad";
    return "t-other";
  }

  function priorityClass(priority) {
    var p = (priority || "").toLowerCase();
    if (p === "highest" || p === "critical" || p === "urgent") return "p-crit";
    if (p === "high")                                           return "p-high";
    if (p === "medium" || p === "normal")                       return "p-med";
    if (p === "low" || p === "lowest")                          return "p-low";
    return "";
  }

  function renderSummary() {
    var now = Date.now();
    var withD = withDerived(state.tickets, now);
    var total = withD.length;
    var uncategorized = withD.filter(function (t) { return t.categoryShown === "Uncategorized"; }).length;
    var partners = {};
    withD.forEach(function (t) { partners[t.partnerShown] = true; });
    var catCounts = {};
    withD.forEach(function (t) {
      if (t.categoryShown !== "Uncategorized") {
        catCounts[t.categoryShown] = (catCounts[t.categoryShown] || 0) + 1;
      }
    });
    var topCat = Object.keys(catCounts).sort(function (a, b) { return catCounts[b] - catCounts[a]; })[0];

    if (!total) {
      els.summaryStrip.innerHTML = '<span>Naloži .csv ali .xlsx izvoz, da se prikaže povzetek.</span>';
      return;
    }
    els.summaryStrip.innerHTML =
      '<span><b>' + total + '</b> ticketov</span>' +
      '<span><b class="' + (uncategorized ? 'flag' : '') + '">' + uncategorized + '</b> nekategoriziranih</span>' +
      '<span><b>' + Object.keys(partners).length + '</b> partnerjev</span>' +
      (topCat ? '<span>Najpogostejša: <b>' + escapeHtml(topCat) + '</b> (' + catCounts[topCat] + ')</span>' : '');
  }

  function renderLoadMeta() {
    if (!state.tickets.length) {
      els.loadMeta.textContent = "Ni naloženih podatkov.";
      return;
    }
    var when = state.loadedAt ? relTime(state.loadedAt) : "";
    els.loadMeta.innerHTML = 'Vir: <b>' + escapeHtml(state.filename || "neznano") + '</b>' +
      (when ? ' · naloženo ' + when + ' nazaj' : '') + ' · ' + state.tickets.length + ' vrstic';
  }

  function renderHeader() {
    els.headerRow.innerHTML = COLUMNS.map(function (c) {
      var active = state.sortKey === c.key;
      var arrow = active ? (state.sortDir === "asc" ? "▲" : "▼") : "↕";
      return '<th><button class="th-btn' + (c.type === "num" ? " num" : "") + (active ? " active" : "") +
        '" data-key="' + c.key + '">' + escapeHtml(c.label) +
        '<span class="sort-arrow">' + arrow + '</span></button></th>';
    }).join("");
    Array.prototype.forEach.call(els.headerRow.querySelectorAll(".th-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-key");
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortDir = (key === "subject" || key === "partnerShown" || key === "status") ? "asc" : "desc";
        }
        renderBody();
      });
    });
  }

  function categoryOptions(selected) {
    var opts = '<option value="">Uncategorized</option>';
    state.categories.forEach(function (c) {
      opts += '<option value="' + escapeHtml(c) + '"' + (c === selected ? " selected" : "") + '>' + escapeHtml(c) + '</option>';
    });
    return opts;
  }

  function renderFilterRow() {
    var statuses = Array.from(new Set(state.tickets.map(function (t) { return t.status; }))).sort();
    var cats = state.categories.slice().sort();
    function selectOpts(list, current, allLabel) {
      return '<option value="">' + allLabel + '</option>' + list.map(function (v) {
        return '<option value="' + escapeHtml(v) + '"' + (v === current ? " selected" : "") + '>' + escapeHtml(v) + '</option>';
      }).join("");
    }
    els.filterRow.innerHTML =
      '<th><input type="text" data-filter="key" placeholder="#" value="' + escapeHtml(state.filters.key) + '"></th>' +
      '<th><select data-filter="status">' + selectOpts(statuses, state.filters.status, "Vsi") + '</select></th>' +
      '<th><input type="text" data-filter="subject" placeholder="vsebuje…" value="' + escapeHtml(state.filters.subject) + '"></th>' +
      '<th><input type="text" data-filter="partner" placeholder="vsebuje…" value="' + escapeHtml(state.filters.partner) + '"></th>' +
      '<th><select data-filter="category">' + selectOpts(cats, state.filters.category, "Vse") + '</select></th>' +
      '<th></th><th></th><th></th><th></th><th></th>';
    Array.prototype.forEach.call(els.filterRow.querySelectorAll("[data-filter]"), function (el) {
      var evt = el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(evt, function () {
        state.filters[el.getAttribute("data-filter")] = el.value;
        renderBody();
        renderSummary();
      });
    });
  }

  function confBar(confidence, source) {
    if (source !== "auto" || !confidence) return "";
    var pct = Math.round(confidence * 100);
    var barColor = pct >= 70 ? "var(--ok)" : pct >= 45 ? "var(--warn)" : "var(--bad)";
    return '<div class="conf-row">' +
      '<div class="conf-bar-wrap" title="' + pct + '% confidence">' +
        '<div class="conf-bar" style="width:' + pct + '%;background:' + barColor + '"></div>' +
      '</div>' +
      '<span class="conf-pct">' + pct + '%</span>' +
    '</div>';
  }

  function ticketRowHtml(t) {
    var idleCls = t.idleDays === null ? "" : (t.idleDays >= 7 ? "bad" : (t.idleDays >= 3 ? "warn" : "ok"));
    var prio = t.priority;
    var prioCls = priorityClass(prio);

    // Description preview for hover tooltip (trimmed, first 250 chars)
    var descPreview = (t.description || "").replace(/\s+/g, " ").slice(0, 250).trim();
    if (descPreview.length === 250) descPreview += "…";

    var idleCell = idleCls
      ? '<span class="idle-dot ' + idleCls + '"></span>' + fmtDays(t.idleDays)
      : fmtDays(t.idleDays);

    return '<tr data-key="' + escapeHtml(t.key) + '" class="ticket-row">' +
      // ID
      '<td class="id-cell">' +
        escapeHtml(t.key) +
        (t.issueType === "Sub-task" ? '<div class="type-badge subtask">sub</div>' : '') +
      '</td>' +

      // Status
      '<td><span class="tag ' + statusClass(t.status) + '">' + escapeHtml(t.status) + '</span></td>' +

      // Subject — with description tooltip
      '<td class="subject-cell" data-desc="' + escapeHtml(descPreview) + '">' +
        '<div class="subject-text">' + escapeHtml(t.subject) + '</div>' +
        (prio && prioCls ? '<span class="prio-dot ' + prioCls + '" title="' + escapeHtml(prio) + '"></span>' : '') +
      '</td>' +

      // Partner
      '<td><input class="editable" data-field="partner" data-key="' + escapeHtml(t.key) + '" value="' + escapeHtml(t.partnerShown) + '"></td>' +

      // Category + confidence bar
      '<td>' +
        '<select class="editable" data-field="category" data-key="' + escapeHtml(t.key) + '">' +
          categoryOptions(t.categoryShown === "Uncategorized" ? "" : t.categoryShown) +
        '</select>' +
        confBar(t.categoryConfidence, t.categorySource) +
      '</td>' +

      // Next action
      '<td><input class="editable" data-field="nextAction" data-key="' + escapeHtml(t.key) + '" value="' + escapeHtml(t.nextActionShown) + '" placeholder="—"></td>' +

      // Created date
      '<td class="date-cell" title="' + escapeHtml(fmtDateFull(t.createdDate)) + '">' +
        '<div class="date-abs">' + escapeHtml(fmtDateShort(t.createdDate)) + '</div>' +
        '<div class="date-rel">' + escapeHtml(relTimeFromDate(t.createdDate)) + '</div>' +
      '</td>' +

      // Updated date
      '<td class="date-cell" title="' + escapeHtml(fmtDateFull(t.updatedDate)) + '">' +
        '<div class="date-abs">' + escapeHtml(fmtDateShort(t.updatedDate)) + '</div>' +
        '<div class="date-rel">' + escapeHtml(relTimeFromDate(t.updatedDate)) + '</div>' +
      '</td>' +

      // Age / Idle
      '<td class="num">' + fmtDays(t.ageDays) + '</td>' +
      '<td class="num">' + idleCell + '</td>' +
    '</tr>';
  }

  function groupHeaderHtml(g, collapsed) {
    var aggBits = [];
    if (g.avgRes !== null)  aggBits.push("povp. reševanje " + fmtDays(g.avgRes));
    if (g.avgIdle !== null) aggBits.push("povp. idle " + fmtDays(g.avgIdle));
    return '<tr class="group-header' + (collapsed ? " collapsed" : "") + '" data-group="' + escapeHtml(g.key) + '">' +
      '<td colspan="10"><span class="chev">▾</span>' + escapeHtml(g.key) +
      '<span class="count">' + g.count + ' ticketov</span>' +
      '<span class="agg">' + aggBits.join(" · ") + '</span></td></tr>';
  }

  // -----------------------------------------------------------------
  // Description tooltip — follows the cursor
  // -----------------------------------------------------------------
  var descTooltip = null;
  function initDescTooltip() {
    descTooltip = document.createElement("div");
    descTooltip.className = "desc-tooltip";
    document.body.appendChild(descTooltip);

    els.tableBody.addEventListener("mouseover", function (e) {
      var cell = e.target.closest(".subject-cell");
      if (cell) {
        var desc = cell.getAttribute("data-desc");
        if (desc) {
          descTooltip.textContent = desc;
          descTooltip.classList.add("visible");
        }
      }
    });
    els.tableBody.addEventListener("mouseout", function (e) {
      if (e.target.closest(".subject-cell")) {
        descTooltip.classList.remove("visible");
      }
    });
    document.addEventListener("mousemove", function (e) {
      if (descTooltip.classList.contains("visible")) {
        var x = e.clientX + 16, y = e.clientY + 12;
        // Keep tooltip inside viewport
        var tw = descTooltip.offsetWidth;
        if (x + tw > window.innerWidth - 8) x = e.clientX - tw - 8;
        descTooltip.style.left = x + "px";
        descTooltip.style.top  = y + "px";
      }
    });
  }

  // -----------------------------------------------------------------
  // Main render functions
  // -----------------------------------------------------------------
  function renderBody() {
    var now = Date.now();
    var filtered = getFiltered(now);
    var sorted   = sortRows(filtered);

    if (!state.tickets.length) {
      els.tableBody.innerHTML = '<tr><td colspan="10"><div class="empty-state">Ni podatkov. Povleci .csv ali .xlsx izvoz kamorkoli na to stran, ali klikni "Naloži izvoz" zgoraj.</div></td></tr>';
    } else if (!sorted.length) {
      els.tableBody.innerHTML = '<tr><td colspan="10"><div class="empty-state">Noben ticket ne ustreza trenutnim filtrom.</div></td></tr>';
    } else if (state.groupBy === "none") {
      els.tableBody.innerHTML = sorted.map(ticketRowHtml).join("");
    } else {
      var groups = buildGroups(sorted);
      var html = "";
      groups.forEach(function (g) {
        var collapsed = !!state.collapsedGroups[g.key];
        html += groupHeaderHtml(g, collapsed);
        if (!collapsed) html += g.rows.map(ticketRowHtml).join("");
      });
      els.tableBody.innerHTML = html;
      Array.prototype.forEach.call(els.tableBody.querySelectorAll(".group-header"), function (tr) {
        tr.addEventListener("click", function () {
          var k = tr.getAttribute("data-group");
          state.collapsedGroups[k] = !state.collapsedGroups[k];
          renderBody();
        });
      });
    }

    els.shownCount.textContent = sorted.length;
    els.totalCount.textContent = state.tickets.length;
    wireRowEditing();
  }

  function wireRowEditing() {
    Array.prototype.forEach.call(els.tableBody.querySelectorAll("[data-field]"), function (el) {
      var evt = el.tagName === "SELECT" ? "change" : "blur";
      el.addEventListener(evt, function () {
        var key   = el.getAttribute("data-key");
        var field = el.getAttribute("data-field");
        var ov    = Object.assign({}, state.overrides[key]);
        if (field === "category") {
          ov.category           = el.value || null;
          ov.categorySource     = "manual";
          ov.categoryConfidence = null;
        } else if (field === "partner") {
          ov.partnerOverride = el.value.trim();
        } else if (field === "nextAction") {
          ov.nextAction = el.value;
        }
        ov.updatedAt = Date.now();
        state.overrides[key] = ov;
        saveJSON(LS_OVERRIDES, state.overrides);
        if (field === "category") renderBody();
      });
    });
  }

  function render() {
    renderLoadMeta();
    renderSummary();
    renderHeader();
    renderFilterRow();
    renderBody();
    if (document.getElementById("tab-report").classList.contains("active")) {
      renderReport();
    }
  }

  // -----------------------------------------------------------------
  // Tab switching
  // -----------------------------------------------------------------
  function initTabs() {
    Array.prototype.forEach.call(document.querySelectorAll(".tab-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.getAttribute("data-tab");
        Array.prototype.forEach.call(document.querySelectorAll(".tab-btn"), function (b) {
          b.classList.toggle("active", b === btn);
        });
        Array.prototype.forEach.call(document.querySelectorAll(".tab-panel"), function (p) {
          p.classList.toggle("active", p.id === "tab-" + tab);
        });
        if (tab === "report") renderReport();
      });
    });
  }

  // -----------------------------------------------------------------
  // Report / Analysis tab
  // -----------------------------------------------------------------
  var _reportCharts = {};

  var PALETTE = [
    "#5aa7ff","#d4af37","#a78bfa","#3ecf8e","#f5b942",
    "#f06060","#60d0f0","#e87040","#70c060","#c060f0",
    "#ff9060","#60c0c0","#9090ff","#f0c060","#b0e060",
    "#f06090","#60f0c0","#e0b060","#80b0ff","#d070d0"
  ];

  function destroyCharts() {
    Object.keys(_reportCharts).forEach(function (k) {
      try { _reportCharts[k].destroy(); } catch (e) {}
    });
    _reportCharts = {};
  }

  function countBy(tickets, fn) {
    var map = {};
    tickets.forEach(function (t) {
      var k = fn(t) || "—";
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }

  function topN(map, n) {
    return Object.keys(map)
      .sort(function (a, b) { return map[b] - map[a]; })
      .slice(0, n);
  }

  function mkCanvas(id, height) {
    return '<canvas id="' + id + '" height="' + height + '"></canvas>';
  }

  function chartDefaults() {
    if (!window.Chart) return;
    Chart.defaults.color = "#8b98b3";
    Chart.defaults.borderColor = "#1f2b45";
    Chart.defaults.font.family = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
    Chart.defaults.font.size = 11;
  }

  function makePie(id, labels, data, total) {
    var ctx = document.getElementById(id);
    if (!ctx || !window.Chart) return;
    _reportCharts[id] = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: PALETTE.slice(0, labels.length),
          borderColor: "#0b1120",
          borderWidth: 2,
          hoverBorderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "55%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#8b98b3", font: { size: 10 }, padding: 10, boxWidth: 10, boxHeight: 10 }
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var pct = total ? Math.round(ctx.parsed / total * 100) : 0;
                return "  " + ctx.label + ": " + ctx.parsed + " (" + pct + "%)";
              }
            }
          }
        }
      }
    });
  }

  function makeBar(id, labels, data, color, horizontal, label) {
    var ctx = document.getElementById(id);
    if (!ctx || !window.Chart) return;
    _reportCharts[id] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: label || "Ticketi",
          data: data,
          backgroundColor: color + "cc",
          borderColor: color,
          borderWidth: 1,
          borderRadius: 4,
          hoverBackgroundColor: color
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? "y" : "x",
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return "  " + c.parsed[horizontal ? "x" : "y"] + " ticketov"; } } }
        },
        scales: {
          x: { grid: { color: horizontal ? "transparent" : "#1f2b45" }, ticks: { color: "#8b98b3", font: { size: 10 } } },
          y: { grid: { color: horizontal ? "#1f2b45" : "transparent" }, ticks: { color: "#8b98b3", font: { size: 10 } } }
        }
      }
    });
  }

  function makeLine(id, labels, data) {
    var ctx = document.getElementById(id);
    if (!ctx || !window.Chart) return;
    _reportCharts[id] = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "Ticketi",
          data: data,
          borderColor: "#5aa7ff",
          backgroundColor: "rgba(90,167,255,0.12)",
          borderWidth: 2,
          pointBackgroundColor: "#5aa7ff",
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: "#1f2b45" }, ticks: { color: "#8b98b3", font: { size: 10 } } },
          y: { grid: { color: "#1f2b45" }, ticks: { color: "#8b98b3", font: { size: 10 }, stepSize: 1 }, beginAtZero: true }
        }
      }
    });
  }

  function statCard(label, value, sub, color) {
    return '<div class="stat-card" style="--sc:' + color + '">' +
      '<div class="stat-label">' + escapeHtml(label) + '</div>' +
      '<div class="stat-value">' + escapeHtml(String(value)) + '</div>' +
      (sub ? '<div class="stat-sub">' + escapeHtml(sub) + '</div>' : '') +
    '</div>';
  }

  function breakdownTable(title, map, total) {
    var keys = Object.keys(map).sort(function (a, b) { return map[b] - map[a]; });
    var rows = keys.map(function (k) {
      var pct = total ? Math.round(map[k] / total * 100) : 0;
      return '<tr>' +
        '<td>' + escapeHtml(k) + '</td>' +
        '<td class="nc">' + map[k] + '</td>' +
        '<td class="pc">' + pct + '%</td>' +
      '</tr>';
    }).join("");
    return '<div class="report-table-card">' +
      '<h3>' + escapeHtml(title) + '</h3>' +
      '<table class="report-tbl">' +
        '<thead><tr><th>Ime</th><th class="r">Število</th><th class="r">%</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
  }

  function renderReport() {
    var root = document.getElementById("reportRoot");
    if (!root) return;

    if (!state.tickets.length) {
      root.innerHTML = '<div class="report-empty">Ni podatkov. Naloži .csv ali .xlsx izvoz najprej.</div>';
      return;
    }

    destroyCharts();
    chartDefaults();

    var now = Date.now();
    var tickets = withDerived(state.tickets, now);
    var total = tickets.length;

    var statusMap   = countBy(tickets, function (t) { return t.status; });
    var partnerMap  = countBy(tickets, function (t) { return t.partnerShown; });
    var categoryMap = countBy(tickets, function (t) { return t.categoryShown; });
    var priorityMap = countBy(tickets, function (t) { return t.priority || "Brez prioritete"; });

    var monthMap = {};
    tickets.forEach(function (t) {
      if (t.createdDate) {
        var mo = t.createdDate.toISOString().slice(0, 7);
        monthMap[mo] = (monthMap[mo] || 0) + 1;
      }
    });

    var openCount     = 0, solvedCount = 0, pendingCount = 0;
    tickets.forEach(function (t) {
      var sc = statusClass(t.status);
      if (sc === "t-open") openCount++;
      else if (sc === "t-done") solvedCount++;
      else if (sc === "t-todo") pendingCount++;
    });

    var uniquePartners   = Object.keys(partnerMap).length;
    var uniqueCategories = Object.keys(categoryMap).length;
    var uncategorized    = categoryMap["Uncategorized"] || 0;

    // ---- stat cards ----
    var statsHtml =
      '<div class="report-section">' +
        '<h2 class="report-heading">Pregled</h2>' +
        '<div class="stat-grid">' +
          statCard("Skupaj ticketov",    total,           "", "#5aa7ff") +
          statCard("Odprtih",            openCount,       "status: open / new / to do", "#5aa7ff") +
          statCard("Rešenih",            solvedCount,     "status: done / solved / closed", "#3ecf8e") +
          statCard("V teku",             pendingCount,    "status: pending / in progress", "#f5b942") +
          statCard("Partnerjev",         uniquePartners,  "unikatnih partnerjev", "#a78bfa") +
          statCard("Kategorij",          uniqueCategories,"unikatnih kategorij", "#d4af37") +
          statCard("Nekategoriziranih",  uncategorized,   Math.round(uncategorized/total*100) + "% od vseh", "#f06060") +
        '</div>' +
      '</div>';

    // ---- charts ----
    var top10Partners   = topN(partnerMap, 10);
    var top10Categories = topN(categoryMap, 10);
    var monthKeys       = Object.keys(monthMap).sort();
    var statusKeys      = Object.keys(statusMap).sort(function (a, b) { return statusMap[b] - statusMap[a]; });

    var chartsHtml =
      '<div class="report-section">' +
        '<h2 class="report-heading">Grafi</h2>' +
        '<div class="chart-grid">' +
          '<div class="chart-card"><h3>Ticketi po partnerju (top 10)</h3>' + mkCanvas("ch-pie-partner", "240") + '</div>' +
          '<div class="chart-card"><h3>Ticketi po kategoriji</h3>'          + mkCanvas("ch-pie-cat",     "240") + '</div>' +
          '<div class="chart-card"><h3>Ticketi po statusu</h3>'             + mkCanvas("ch-bar-status",  "240") + '</div>' +
          '<div class="chart-card wide"><h3>Top 10 partnerjev</h3>'         + mkCanvas("ch-bar-partners","220") + '</div>' +
          '<div class="chart-card"><h3>Top 10 kategorij</h3>'               + mkCanvas("ch-bar-cats",   "220") + '</div>' +
          '<div class="chart-card full"><h3>Obseg po mesecu</h3>'           + mkCanvas("ch-line-vol",   "180") + '</div>' +
        '</div>' +
      '</div>';

    // ---- tables ----
    var tablesHtml =
      '<div class="report-section">' +
        '<h2 class="report-heading">Razčlenitve</h2>' +
        '<div class="table-grid">' +
          breakdownTable("Po partnerju",   partnerMap,  total) +
          breakdownTable("Po kategoriji",  categoryMap, total) +
          breakdownTable("Po statusu",     statusMap,   total) +
        '</div>' +
      '</div>';

    root.innerHTML = statsHtml + chartsHtml + tablesHtml;

    // ---- draw charts after DOM is ready ----
    makePie("ch-pie-partner",
      top10Partners,
      top10Partners.map(function (k) { return partnerMap[k]; }),
      total);

    makePie("ch-pie-cat",
      top10Categories,
      top10Categories.map(function (k) { return categoryMap[k]; }),
      total);

    makeBar("ch-bar-status",
      statusKeys,
      statusKeys.map(function (k) { return statusMap[k]; }),
      "#5aa7ff", false);

    makeBar("ch-bar-partners",
      top10Partners.slice().reverse(),
      top10Partners.slice().reverse().map(function (k) { return partnerMap[k]; }),
      "#d4af37", true);

    makeBar("ch-bar-cats",
      top10Categories.slice().reverse(),
      top10Categories.slice().reverse().map(function (k) { return categoryMap[k]; }),
      "#a78bfa", true);

    makeLine("ch-line-vol",
      monthKeys,
      monthKeys.map(function (k) { return monthMap[k]; }));
  }

  // -----------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------
  function applyImportedRows(normalized, filename, loadedAt) {
    state.tickets  = normalized;
    state.filename = filename;
    state.loadedAt = loadedAt;
    applyAutoCategorization(state.tickets);
    saveJSON(LS_RAW, { tickets: serializeTickets(normalized), filename: filename, loadedAt: loadedAt });
    render();
  }

  function serializeTickets(tickets) {
    return tickets.map(function (t) {
      return Object.assign({}, t, {
        createdDate:  t.createdDate  ? t.createdDate.toISOString()  : null,
        updatedDate:  t.updatedDate  ? t.updatedDate.toISOString()  : null,
        resolvedDate: t.resolvedDate ? t.resolvedDate.toISOString() : null
      });
    });
  }

  function deserializeTickets(rows) {
    return rows.map(function (t) {
      return Object.assign({}, t, {
        description:  t.description  || "",
        issueType:    t.issueType    || "",
        createdDate:  t.createdDate  ? new Date(t.createdDate)  : null,
        updatedDate:  t.updatedDate  ? new Date(t.updatedDate)  : null,
        resolvedDate: t.resolvedDate ? new Date(t.resolvedDate) : null
      });
    });
  }

  function handleFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data       = new Uint8Array(reader.result);
        var wb         = XLSX.read(data, { type: "array" });
        var objRows    = rowsFromWorkbook(wb);
        var normalized = normalizeRows(objRows);
        applyImportedRows(normalized, file.name, Date.now());
      } catch (err) {
        alert("Datoteke ni bilo mogoče prebrati: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function initEvents() {
    els.globalSearch.addEventListener("input", function () {
      state.globalSearch = els.globalSearch.value;
      renderBody();
    });
    els.groupBy.addEventListener("change", function () {
      state.groupBy = els.groupBy.value;
      state.collapsedGroups = {};
      renderBody();
    });
    els.loadBtn.addEventListener("click", function () { els.fileInput.click(); });
    els.fileInput.addEventListener("change", function () {
      var file = els.fileInput.files && els.fileInput.files[0];
      if (file) handleFile(file);
      els.fileInput.value = "";
    });
    els.addCatBtn.addEventListener("click", function () {
      var name = els.newCatInput.value.trim();
      if (!name) return;
      var exists = state.categories.some(function (c) { return c.toLowerCase() === name.toLowerCase(); });
      if (!exists) {
        state.categories.push(name);
        saveJSON(LS_CATEGORIES, state.categories);
        renderFilterRow();
        renderBody();
      }
      els.newCatInput.value = "";
    });

    ["dragenter", "dragover"].forEach(function (evt) {
      els.dropZone.addEventListener(evt, function (e) { e.preventDefault(); els.dropZone.classList.add("dragover"); });
    });
    ["dragleave", "drop"].forEach(function (evt) {
      els.dropZone.addEventListener(evt, function (e) { e.preventDefault(); els.dropZone.classList.remove("dragover"); });
    });
    els.dropZone.addEventListener("drop", function (e) {
      var file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    initDescTooltip();
  }

  function init() {
    cacheEls();
    state.categories = loadJSON(LS_CATEGORIES, window.TicketRules.DEFAULT_CATEGORIES.slice());
    state.overrides  = loadJSON(LS_OVERRIDES, {});
    initTabs();
    initEvents();

    var savedRaw = loadJSON(LS_RAW, null);
    if (savedRaw && savedRaw.tickets && savedRaw.tickets.length) {
      state.tickets  = deserializeTickets(savedRaw.tickets);
      state.filename = savedRaw.filename;
      state.loadedAt = savedRaw.loadedAt;
    }
    render();
  }

  function boot() {
    if (window.TicketAuth.isUnlocked()) {
      document.body.classList.remove("locked");
      init();
    } else {
      window.TicketAuth.showGate(init);
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
