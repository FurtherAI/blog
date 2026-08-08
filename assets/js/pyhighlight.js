(function () {
  // Lightweight regex-based Python tokenizer, colored to match the site's
  // "Tokyo Glow" theme (base theme + personal token-color overrides).
  // Order matters: earlier alternatives win at a given position.
  var TOKEN_RE = new RegExp(
    [
      "(?<comment>#[^\\n]*)",
      "(?<string>[rRbBfFuU]{0,2}(?:'''[\\s\\S]*?'''|\"\"\"[\\s\\S]*?\"\"\"|'(?:\\\\.|[^'\\\\\\n])*'|\"(?:\\\\.|[^\"\\\\\\n])*\"))",
      "(?<number>\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)",
      "(?<defname>(?<=\\bdef\\s)[A-Za-z_]\\w*)",
      "(?<classname>(?<=\\bclass\\s)[A-Za-z_]\\w*)",
      "(?<selfword>\\bself\\b)",
      "(?<boolnone>\\b(?:True|False|None)\\b)",
      "(?<classkw>\\bclass\\b)",
      "(?<ellipsis>\\.\\.\\.)",
      "(?<keyword>\\b(?:def|if|elif|else|for|while|return|yield|try|except|finally|raise|with|break|continue|pass|and|or|not|in|is|import|from|as|lambda|global|nonlocal|del|assert|async|await|yield)\\b)",
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
    defname: "tok-funcname",
    classname: "tok-classname",
    selfword: "tok-self",
    boolnone: "tok-boolnone",
    classkw: "tok-classname",
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

  function highlight(source) {
    var out = [];
    var cursor = 0;
    TOKEN_RE.lastIndex = 0;
    var match;
    while ((match = TOKEN_RE.exec(source))) {
      if (match.index > cursor) {
        out.push(escapeHtml(source.slice(cursor, match.index)));
      }
      var groupName = Object.keys(match.groups).find(function (key) {
        return match.groups[key] !== undefined;
      });
      var cls = CLASS_BY_GROUP[groupName] || "tok-name";
      out.push('<span class="' + cls + '">' + escapeHtml(match[0]) + "</span>");
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
