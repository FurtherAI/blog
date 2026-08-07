(function () {
  var SEQ_LEN = 1000;

  var SEGMENTS = {
    R: { label: "R — system prompt", length: 200, color: 1 },
    P1: { label: "P1 — group 1 task prompt", length: 300, color: 2 },
    P2: { label: "P2 — group 2 task prompt", length: 250, color: 3 },
    C1a: { label: "completion 1a", length: 150, color: 4 },
    C1b: { label: "completion 1b", length: 200, color: 5 },
    C2a: { label: "completion 2a", length: 180, color: 6 },
    C2b: { label: "completion 2b", length: 220, color: 7 },
    C3: { label: "completion 3 (unrelated group)", length: 400, color: 8 },
  };

  var LEAVES = [
    { id: "C1a", group: "G1", path: ["R", "P1", "C1a"] },
    { id: "C1b", group: "G1", path: ["R", "P1", "C1b"] },
    { id: "C2a", group: "G2", path: ["R", "P2", "C2a"] },
    { id: "C2b", group: "G2", path: ["R", "P2", "C2b"] },
    { id: "C3", group: "G3", path: ["R", "C3"] },
  ];

  function cost(leaf) {
    return leaf.path.reduce(function (sum, s) {
      return sum + SEGMENTS[s].length;
    }, 0);
  }

  function insertionDelta(bin, leaf) {
    return leaf.path.reduce(function (sum, s) {
      return bin.segments.indexOf(s) === -1 ? sum + SEGMENTS[s].length : sum;
    }, 0);
  }

  // Faithful port of ART's best-fit-decreasing over prefix-tree marginal cost
  // (src/art/preprocessing/pack.py: _place_prefix_tree_leaves).
  function computeSteps() {
    var groups = {};
    LEAVES.forEach(function (leaf) {
      (groups[leaf.group] = groups[leaf.group] || []).push(leaf);
    });
    var groupList = Object.keys(groups).map(function (k) {
      return groups[k];
    });
    groupList.sort(function (a, b) {
      var maxA = Math.max.apply(null, a.map(cost));
      var maxB = Math.max.apply(null, b.map(cost));
      return maxB - maxA;
    });

    var bins = [];
    var steps = [];
    groupList.forEach(function (group) {
      group.forEach(function (leaf) {
        var leafCost = cost(leaf);
        var evaluations = bins.map(function (bin) {
          var delta = insertionDelta(bin, leaf);
          var total = bin.tokenCount + delta;
          return { bin: bin, delta: delta, total: total, fits: total <= SEQ_LEN };
        });
        var best = null;
        var bestRemaining = SEQ_LEN + 1;
        evaluations.forEach(function (ev) {
          if (ev.fits && SEQ_LEN - ev.total < bestRemaining) {
            best = ev.bin;
            bestRemaining = SEQ_LEN - ev.total;
          }
        });
        var created = false;
        if (!best) {
          best = { segments: [], tokenCount: 0, id: bins.length };
          bins.push(best);
          created = true;
        }
        var delta = insertionDelta(best, leaf);
        best.tokenCount += delta;
        leaf.path.forEach(function (s) {
          if (best.segments.indexOf(s) === -1) best.segments.push(s);
        });
        steps.push({
          leaf: leaf,
          leafCost: leafCost,
          evaluations: evaluations,
          binId: best.id,
          delta: delta,
          created: created,
          binsSnapshot: bins.map(function (b) {
            return { id: b.id, segments: b.segments.slice(), tokenCount: b.tokenCount };
          }),
        });
      });
    });
    return steps;
  }

  function segBar(path, opts) {
    opts = opts || {};
    var el = document.createElement("div");
    el.className = "bin-track";
    var total = opts.scaleTo || SEQ_LEN;
    path.forEach(function (s) {
      var seg = SEGMENTS[s];
      var piece = document.createElement("div");
      piece.className = "bin-seg seg-" + seg.color;
      piece.style.width = (100 * seg.length / total) + "%";
      piece.title = seg.label + " · " + seg.length + " tok";
      if (seg.length / total > 0.08) piece.textContent = s;
      if (opts.dimExcept && opts.dimExcept.indexOf(s) === -1) {
        piece.classList.add("dim");
      }
      el.appendChild(piece);
    });
    var used = path.reduce(function (sum, s) {
      return sum + SEGMENTS[s].length;
    }, 0);
    if (used < total) {
      var empty = document.createElement("div");
      empty.className = "bin-fill-empty";
      empty.style.width = (100 * (total - used) / total) + "%";
      el.appendChild(empty);
    }
    return el;
  }

  function mount(root) {
    var steps = computeSteps();
    var stepIndex = 0; // 0 = initial state, 1..steps.length = after that placement

    var queueEl = root.querySelector(".bin-demo-queue");
    var binsEl = root.querySelector(".bin-demo-bins");
    var readoutEl = root.querySelector(".bin-demo-readout");
    var labelEl = root.querySelector(".bin-demo-step-label");
    var prevBtn = root.querySelector(".bin-demo-prev");
    var nextBtn = root.querySelector(".bin-demo-next");
    var resetBtn = root.querySelector(".bin-demo-reset");

    function render() {
      queueEl.innerHTML = "";
      LEAVES.forEach(function (leaf, i) {
        var placed = i < stepIndex;
        var row = document.createElement("div");
        row.className = "bin-row" + (placed ? " placed" : "");
        var label = document.createElement("div");
        label.className = "bin-row-label";
        label.textContent = leaf.id;
        row.appendChild(label);
        row.appendChild(segBar(leaf.path));
        var costLabel = document.createElement("div");
        costLabel.className = "bin-row-cost";
        costLabel.textContent = cost(leaf) + " tok";
        row.appendChild(costLabel);
        queueEl.appendChild(row);
      });

      binsEl.innerHTML = "";
      var snapshot = stepIndex === 0 ? [] : steps[stepIndex - 1].binsSnapshot;
      snapshot.forEach(function (bin) {
        var row = document.createElement("div");
        row.className = "bin-row";
        var label = document.createElement("div");
        label.className = "bin-row-label";
        label.textContent = "row " + (bin.id + 1);
        row.appendChild(label);
        row.appendChild(segBar(bin.segments, { scaleTo: SEQ_LEN }));
        var fillLabel = document.createElement("div");
        fillLabel.className = "bin-row-cost";
        fillLabel.textContent = bin.tokenCount + "/" + SEQ_LEN;
        row.appendChild(fillLabel);
        binsEl.appendChild(row);
      });
      if (snapshot.length === 0) {
        var empty = document.createElement("p");
        empty.className = "bin-demo-empty";
        empty.textContent = "No rows opened yet.";
        binsEl.appendChild(empty);
      }

      if (stepIndex === 0) {
        readoutEl.innerHTML =
          "Five completions, three unrelated groups (G1, G2, G3), " +
          "all sharing a 200-token system prompt <b>R</b>. Step through " +
          "best-fit-decreasing placement leaf by leaf.";
      } else {
        var step = steps[stepIndex - 1];
        var lines = [];
        lines.push(
          "<b>" + step.leaf.id + "</b> costs " + step.leafCost +
          " tok on its own (" + step.leaf.path.join(" + ") + ")."
        );
        if (step.evaluations.length === 0) {
          lines.push("No rows exist yet → open row " + (step.binId + 1) + ".");
        } else {
          step.evaluations.forEach(function (ev) {
            var verdict = ev.fits
              ? "<span class=\"fit\">fits</span> (" + ev.total + "/" + SEQ_LEN + ")"
              : "<span class=\"nofit\">doesn't fit</span> (" + ev.total + " > " + SEQ_LEN + ")";
            lines.push(
              "row " + (ev.bin.id + 1) + ": shares " + (step.leafCost - ev.delta) +
              " tok already → only " + ev.delta + " new tok needed → " + verdict + "."
            );
          });
          lines.push(
            step.created
              ? "Nothing fit → open row " + (step.binId + 1) + "."
              : "Best fit: row " + (step.binId + 1) + "."
          );
        }
        readoutEl.innerHTML = lines.join("<br>");
      }

      labelEl.textContent = "Step " + stepIndex + " of " + steps.length;
      prevBtn.disabled = stepIndex === 0;
      nextBtn.disabled = stepIndex === steps.length;

      if (stepIndex === steps.length) {
        var totalPhysical = snapshot.reduce(function (s, b) { return s + b.tokenCount; }, 0);
        var totalLogical = LEAVES.reduce(function (s, l) { return s + cost(l); }, 0);
        var pct = (100 * (1 - totalPhysical / totalLogical)).toFixed(1);
        readoutEl.innerHTML +=
          "<br><br><b>Done:</b> " + snapshot.length + " rows, " + totalPhysical +
          "/" + totalLogical + " tokens (" + pct + "% fewer than five unshared rows " +
          "at " + totalLogical + " tokens — every completion here is already " +
          "over half a row's capacity alone, so no arrangement of raw completions " +
          "could have fit two per row without sharing).";
      }
    }

    prevBtn.addEventListener("click", function () {
      if (stepIndex > 0) { stepIndex -= 1; render(); }
    });
    nextBtn.addEventListener("click", function () {
      if (stepIndex < steps.length) { stepIndex += 1; render(); }
    });
    resetBtn.addEventListener("click", function () {
      stepIndex = 0; render();
    });

    render();
  }

  window.addEventListener("DOMContentLoaded", function () {
    var root = document.getElementById("bin-demo");
    if (root) mount(root);
  });
})();
