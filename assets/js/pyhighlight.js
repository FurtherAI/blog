(function () {
  // Lightweight regex-based Python tokenizer, colored to match the site's
  // "Tokyo Glow" theme (base theme + personal token-color overrides).
  // No lookbehind assertions here on purpose -- Safari didn't support them
  // until 16.4 (2023), and a lookbehind in the pattern throws at construction
  // time, silently killing this whole script in older browsers.
  // Order matters: earlier alternatives win at a given position.
  var TOKEN_RE = new RegExp(
    [
      "(?<comment>#[^\\n]*)",
      "(?<string>[rRbBfFuU]{0,2}(?:'''[\\s\\S]*?'''|\"\"\"[\\s\\S]*?\"\"\"|'(?:\\\\.|[^'\\\\\\n])*'|\"(?:\\\\.|[^\"\\\\\\n])*\"))",
      "(?<number>\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)",
      "(?<defkw>\\bdef)(?<defgap>\\s+)(?<defname>[A-Za-z_]\\w*)",
      "(?<classkw>\\bclass)(?<classgap>\\s+)(?<classname>[A-Za-z_]\\w*)",
      "(?<selfword>\\bself\\b)",
      "(?<boolnone>\\b(?:True|False|None)\\b)",
      "(?<ellipsis>\\.\\.\\.)",
      "(?<keyword>\\b(?:if|elif|else|for|while|return|yield|try|except|finally|raise|with|break|continue|pass|and|or|not|in|is|import|from|as|lambda|global|nonlocal|del|assert|async|await)\\b)",
      "(?<funcname>[A-Za-z_]\\w*(?=\\s*\\())",
      "(?<cmpop>==|!=|<=|>=|<|>)",
      "(?<bracket>[()\\[\\]{}])",
      "(?<op>->|:=|[-+*/%=:,.@~^&|])",
      "(?<name>[A-Za-z_]\\w*)",
    ].join("|"),
    "g"
  );

  var CLASS_BY_GROUP = {
    comment: "tok-comment",
    string: "tok-string",
    number: "tok-number",
    selfword: "tok-self",
    boolnone: "tok-boolnone",
    ellipsis: "tok-keyword",
    keyword: "tok-keyword",
    funcname: "tok-funcname",
    cmpop: "tok-cmpop",
    bracket: "tok-bracket",
    op: "tok-keyword",
    name: "tok-name",
  };

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function span(cls, text) {
    return '<span class="' + cls + '">' + escapeHtml(text) + "</span>";
  }

  function highlight(source) {
    var out = [];
    var cursor = 0;
    TOKEN_RE.lastIndex = 0;
    var match;
    while ((match = TOKEN_RE.exec(source))) {
      if (match.index > cursor) {
        out.push(escapeHtml(source.slice(cursor, match.index)));
      }
      var g = match.groups;
      if (g.defname !== undefined) {
        out.push(span("tok-keyword", g.defkw));
        out.push(escapeHtml(g.defgap));
        out.push(span("tok-funcname", g.defname));
      } else if (g.classname !== undefined) {
        out.push(span("tok-classname", g.classkw));
        out.push(escapeHtml(g.classgap));
        out.push(span("tok-classname", g.classname));
      } else {
        var groupName = Object.keys(g).find(function (key) {
          return g[key] !== undefined;
        });
        out.push(span(CLASS_BY_GROUP[groupName] || "tok-name", match[0]));
      }
      cursor = TOKEN_RE.lastIndex;
    }
    out.push(escapeHtml(source.slice(cursor)));
    return out.join("");
  }

  window.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("pre > code").forEach(function (block) {
      block.innerHTML = highlight(block.textContent);
    });
  });
})();
