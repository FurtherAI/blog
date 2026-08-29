(function () {
  "use strict";

  var root = document.documentElement;

  function css(name) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }

  function renderCapacity(cp) {
    var row = document.getElementById("capacity-row");
    if (!row) return;
    row.replaceChildren();
    var rootTokens = 24;
    var completionTokens = 8;
    var totalTokens = 64 * cp;
    var treeRollouts = Math.floor((totalTokens - rootTokens) / completionTokens);
    var flatRollouts = Math.floor(totalTokens / (rootTokens + completionTokens));

    function piece(track, kind, tokens) {
      var element = document.createElement("span");
      element.className = "capacity-piece " + kind;
      element.style.flex = "0 0 " + (100 * tokens / totalTokens) + "%";
      track.appendChild(element);
    }

    function line(label, rollouts, tree) {
      var element = document.createElement("div");
      element.className = "capacity-line";
      var title = document.createElement("b");
      title.textContent = label;
      var track = document.createElement("div");
      track.className = "capacity-track";
      if (tree) {
        piece(track, "tree-root", rootTokens);
        for (var index = 0; index < rollouts; index += 1) {
          piece(track, "tree-completion", completionTokens);
        }
        piece(track, "unused", totalTokens - rootTokens - rollouts * completionTokens);
      } else {
        for (var rollout = 0; rollout < rollouts; rollout += 1) {
          piece(track, "flat-root", rootTokens);
          piece(track, "flat-completion", completionTokens);
        }
        piece(track, "unused", totalTokens - rollouts * (rootTokens + completionTokens));
      }
      var output = document.createElement("output");
      output.textContent = rollouts + " traj";
      element.append(title, track, output);
      row.appendChild(element);
    }

    line("prefix tree", treeRollouts, true);
    line("flattened", flatRollouts, false);
    var legend = document.createElement("div");
    legend.className = "capacity-legend";
    legend.innerHTML = [
      '<span class="tree-root-key">shared root once</span>',
      '<span class="tree-leaf-key">tree completion</span>',
      '<span class="flat-root-key">repeated root</span>',
      '<span class="flat-leaf-key">flat completion</span>'
    ].join("");
    row.appendChild(legend);

    document.getElementById("scale-tokens").textContent = totalTokens + "K";
    document.getElementById("scale-tree-rollouts").textContent = String(treeRollouts);
    document.getElementById("scale-flat-rollouts").textContent = String(flatRollouts);
    document.getElementById("scale-rollouts").textContent = (treeRollouts / flatRollouts).toFixed(2) + "x";
  }

  function initScaleFigure() {
    var buttons = Array.from(document.querySelectorAll("[data-cp]"));
    if (!buttons.length) return;
    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        buttons.forEach(function (candidate) {
          candidate.setAttribute(
            "aria-pressed",
            candidate === button ? "true" : "false"
          );
        });
        renderCapacity(Number(button.dataset.cp));
      });
    });
    renderCapacity(4);
  }

  var resultData = {
    dense: {
      title: "Dense attention weak scaling",
      unit: "runtime / CP1, lower is better",
      labels: ["CP1", "CP2", "CP4", "CP8"],
      series: [
        { name: "fixed 5K", values: [1, 1.124, 1.150, 1.178], color: "--cp-blue" },
        { name: "varied 5K", values: [1, 1.130, 1.173, 1.195], color: "--cp-cyan" },
        { name: "ideal", values: [1, 1, 1, 1], color: "--text-muted", dashed: true, noPoints: true }
      ],
      min: 0.96,
      max: 1.24,
      note: "Global tokens: 40,960 / 81,920 / 163,840 / 327,680",
      stats: [
        ["8x", "physical tokens, CP1 to CP8"],
        ["1.178x", "fixed layer-time ratio"],
        ["0.70 ms", "CP8 exposed communication"]
      ]
    },
    glm: {
      title: "GLM indexer + sparse MLA",
      unit: "runtime / CP1, lower is better",
      labels: ["CP1", "CP2", "CP4", "CP8"],
      series: [
        { name: "operation", values: [1, 1.243, 1.221, 1.289], color: "--cp-indigo" },
        { name: "ideal", values: [1, 1, 1, 1], color: "--text-muted", dashed: true, noPoints: true }
      ],
      min: 0.96,
      max: 1.34,
      note: "Global tokens: 81,920 / 163,840 / 327,680 / 655,360",
      stats: [
        ["8x", "physical tokens, CP1 to CP8"],
        ["1.289x", "operation-time ratio"],
        ["30.61 GiB", "CP8 peak allocated per rank"]
      ]
    },
    gdn: {
      title: "Qwen3.5 GDN execution",
      unit: "runtime / CP1, lower is better",
      labels: ["CP1", "CP2", "CP4", "CP8"],
      series: [
        { name: "varied 5K", values: [1, 1.193, 1.323, 1.470], color: "--cp-green" },
        { name: "medium", values: [1, 1.399, 1.539, 1.590], color: "--cp-cyan" },
        { name: "chain", values: [1, 1.185, 1.526, 1.717], color: "--cp-magenta" },
        { name: "ideal", values: [1, 1, 1, 1], color: "--text-muted", dashed: true, noPoints: true }
      ],
      min: 0.94,
      max: 1.78,
      note: "Local/mixed plans and a deliberately chain-heavy control",
      stats: [
        ["1.47x", "varied 5K, CP8 / CP1"],
        ["1.59x", "medium-long, CP8 / CP1"],
        ["1.72x", "all-chain, CP8 / CP1"]
      ]
    },
    mamba: {
      title: "Nemotron reduced 39-layer throughput",
      unit: "thousand physical tokens / second",
      labels: ["isolated", "matched\ncore", "end to\nend"],
      series: [
        { name: "throughput", values: [43.624, 43.469, 41.273], color: "--cp-violet", bars: true }
      ],
      min: 0,
      max: 48,
      note: "Same qualified 39-layer workflow shape",
      stats: [
        ["99.64%", "matched-core / isolated"],
        ["94.61%", "end-to-end / isolated"],
        ["3.455 s", "exact 52-layer 128K step"]
      ]
    },
    nodes: {
      title: "24-layer GLM across two H200 nodes",
      unit: "thousand packed tokens / second",
      labels: ["CP8\none node", "CP8\n4 + 4", "CP16\n8 + 8"],
      series: [
        { name: "throughput", values: [17.026, 16.339, 30.913], color: "--cp-violet", bars: true },
        { name: "ideal from split CP8", values: [16.339, 16.339, 32.678], color: "--text-muted", dashed: true, noPoints: true }
      ],
      min: 0,
      max: 34,
      note: "64K / 64K / 128K physical tokens",
      stats: [
        ["95.96%", "same CP8 topology across nodes"],
        ["94.60%", "raw node-add weak scaling"],
        ["96.78%", "useful MFU retention"]
      ]
    }
  };

  var chartState = {
    key: "dense",
    points: []
  };

  function chartColors() {
    return {
      text: css("--text-secondary"),
      muted: css("--text-muted"),
      hairline: css("--hairline"),
      page: css("--surface-card")
    };
  }

  function formatValue(value) {
    return value >= 100 ? value.toFixed(1) : value.toFixed(value < 10 ? 3 : 2);
  }

  function drawChart() {
    var canvas = document.getElementById("results-chart");
    if (!canvas) return;
    var data = resultData[chartState.key];
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.max(320, Math.round(rect.width));
    var height = Math.max(260, Math.round(rect.height));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    var context = canvas.getContext("2d");
    context.scale(dpr, dpr);
    context.clearRect(0, 0, width, height);

    var colors = chartColors();
    var longLegend = data.series.some(function (series) { return series.name.length > 14; });
    var legendColumns = width < 520
      ? (longLegend ? 1 : Math.min(2, data.series.length))
      : data.series.length;
    var legendRows = Math.ceil(data.series.length / legendColumns);
    var margin = { top: 40 + (legendRows - 1) * 18, right: 24, bottom: 55, left: 58 };
    var plotWidth = width - margin.left - margin.right;
    var plotHeight = height - margin.top - margin.bottom;
    var span = data.max - data.min;
    var xStep = plotWidth / Math.max(1, data.labels.length - 1);
    var barMode = Boolean(data.series[0].bars);
    if (barMode) xStep = plotWidth / data.labels.length;

    context.lineWidth = 1;
    context.font = "11px " + css("--mono");
    context.textBaseline = "middle";
    context.textAlign = "right";
    for (var tick = 0; tick <= 4; tick += 1) {
      var value = data.min + span * tick / 4;
      var y = margin.top + plotHeight - plotHeight * tick / 4;
      context.strokeStyle = colors.hairline;
      context.beginPath();
      context.moveTo(margin.left, y);
      context.lineTo(width - margin.right, y);
      context.stroke();
      context.fillStyle = colors.muted;
      context.fillText(formatValue(value), margin.left - 9, y);
    }

    context.textAlign = "center";
    data.labels.forEach(function (label, index) {
      var x = barMode
        ? margin.left + xStep * (index + 0.5)
        : margin.left + xStep * index;
      var lines = label.split("\n");
      lines.forEach(function (line, lineIndex) {
        context.fillStyle = colors.muted;
        context.fillText(line, x, height - margin.bottom + 20 + lineIndex * 13);
      });
    });

    var legendWidth = plotWidth / legendColumns;
    data.series.forEach(function (series, index) {
      var legendX = margin.left + (index % legendColumns) * legendWidth;
      var legendY = 17 + Math.floor(index / legendColumns) * 18;
      var color = css(series.color);
      context.strokeStyle = color;
      context.fillStyle = color;
      context.lineWidth = 2.2;
      if (series.bars) {
        context.fillRect(legendX, legendY - 4, 12, 8);
      } else {
        context.setLineDash(series.dashed ? [6, 5] : []);
        context.beginPath();
        context.moveTo(legendX, legendY);
        context.lineTo(legendX + 16, legendY);
        context.stroke();
        context.setLineDash([]);
      }
      context.textAlign = "left";
      context.fillStyle = colors.text;
      context.fillText(series.name, legendX + 23, legendY);
    });
    context.textAlign = "center";

    chartState.points = [];
    data.series.forEach(function (series) {
      var color = css(series.color);
      if (series.bars) {
        var barWidth = Math.min(82, xStep * 0.55);
        series.values.forEach(function (value, index) {
          var x = margin.left + xStep * (index + 0.5);
          var y = margin.top + plotHeight * (data.max - value) / span;
          context.fillStyle = color;
          context.fillRect(x - barWidth / 2, y, barWidth, margin.top + plotHeight - y);
          chartState.points.push({ x: x, y: y, value: value, name: series.name, label: data.labels[index] });
        });
        return;
      }

      context.strokeStyle = color;
      context.lineWidth = 2.2;
      context.setLineDash(series.dashed ? [6, 5] : []);
      context.beginPath();
      series.values.forEach(function (value, index) {
        var x = barMode
          ? margin.left + xStep * (index + 0.5)
          : margin.left + xStep * index;
        var y = margin.top + plotHeight * (data.max - value) / span;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
      context.setLineDash([]);

      if (!series.noPoints) {
        series.values.forEach(function (value, index) {
          var x = barMode
            ? margin.left + xStep * (index + 0.5)
            : margin.left + xStep * index;
          var y = margin.top + plotHeight * (data.max - value) / span;
          context.fillStyle = colors.page;
          context.strokeStyle = color;
          context.lineWidth = 2.5;
          context.beginPath();
          context.arc(x, y, 5, 0, Math.PI * 2);
          context.fill();
          context.stroke();
          chartState.points.push({ x: x, y: y, value: value, name: series.name, label: data.labels[index] });
        });
      }
    });
  }

  function renderResult(key) {
    chartState.key = key;
    var data = resultData[key];
    document.getElementById("chart-title").textContent = data.title;
    document.getElementById("chart-unit").textContent = data.unit;
    var summary = document.getElementById("result-summary");
    summary.replaceChildren();
    data.stats.forEach(function (stat) {
      var item = document.createElement("div");
      item.className = "result-stat";
      var value = document.createElement("strong");
      value.textContent = stat[0];
      var label = document.createElement("span");
      label.textContent = stat[1];
      item.append(value, label);
      summary.appendChild(item);
    });
    drawChart();
  }

  function initResults() {
    var canvas = document.getElementById("results-chart");
    if (!canvas) return;
    var tabs = Array.from(document.querySelectorAll("[data-result]"));
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (candidate) {
          candidate.setAttribute("aria-selected", candidate === tab ? "true" : "false");
        });
        renderResult(tab.dataset.result);
      });
    });

    var tooltip = document.getElementById("chart-note");
    canvas.addEventListener("mousemove", function (event) {
      var rect = canvas.getBoundingClientRect();
      var x = event.clientX - rect.left;
      var y = event.clientY - rect.top;
      var nearest = null;
      var best = 18;
      chartState.points.forEach(function (point) {
        var distance = Math.hypot(point.x - x, point.y - y);
        if (distance < best) {
          best = distance;
          nearest = point;
        }
      });
      if (!nearest) {
        tooltip.style.display = "none";
        return;
      }
      tooltip.textContent = nearest.label.replace("\n", " ") + " / " + nearest.name + ": " + formatValue(nearest.value);
      tooltip.style.display = "block";
      tooltip.style.left = Math.min(rect.width - 170, nearest.x + 12) + "px";
      tooltip.style.top = Math.max(6, nearest.y - 33) + "px";
    });
    canvas.addEventListener("mouseleave", function () {
      tooltip.style.display = "none";
    });

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(drawChart, 80);
    });
    new MutationObserver(drawChart).observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });
    renderResult("dense");
  }

  function initReadingState() {
    var progress = document.querySelector(".reading-progress span");
    var railLinks = Array.from(document.querySelectorAll(".section-rail a"));
    var sections = railLinks.map(function (link) {
      return document.querySelector(link.getAttribute("href"));
    }).filter(Boolean);

    function updateProgress() {
      var scrollable = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = scrollable <= 0 ? 0 : window.scrollY / scrollable;
      progress.style.width = Math.min(100, Math.max(0, ratio * 100)) + "%";
    }
    window.addEventListener("scroll", updateProgress, { passive: true });
    updateProgress();

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        railLinks.forEach(function (link) {
          link.classList.toggle("active", link.getAttribute("href") === "#" + entry.target.id);
        });
      });
    }, { rootMargin: "-25% 0px -65% 0px" });
    sections.forEach(function (section) { observer.observe(section); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initScaleFigure();
    initResults();
    initReadingState();
  });
})();
