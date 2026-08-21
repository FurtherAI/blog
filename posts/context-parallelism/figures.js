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
    row.style.gridTemplateColumns = "repeat(" + cp + ", minmax(0, 1fr))";

    var unit = 100;
    var total = cp * unit;
    var pieces = [{ start: 0, end: 62, kind: "root" }];
    var cursor = 62;
    var kinds = ["branch-a", "completion", "branch-b", "completion-alt"];
    var widths = [38, 46, 34, 42, 27, 49, 36, 41];
    var index = 0;
    while (cursor < total) {
      var width = widths[index % widths.length];
      pieces.push({
        start: cursor,
        end: Math.min(total, cursor + width),
        kind: kinds[index % kinds.length]
      });
      cursor += width;
      index += 1;
    }

    for (var rank = 0; rank < cp; rank += 1) {
      var rankStart = rank * unit;
      var rankEnd = rankStart + unit;
      var rankEl = document.createElement("div");
      rankEl.className = "capacity-rank";
      rankEl.dataset.rank = "rank " + rank;
      pieces.forEach(function (piece) {
        var start = Math.max(piece.start, rankStart);
        var end = Math.min(piece.end, rankEnd);
        if (end <= start) return;
        var segment = document.createElement("span");
        segment.className = "capacity-segment " + piece.kind;
        segment.style.left = (start - rankStart) + "%";
        segment.style.width = (end - start) + "%";
        rankEl.appendChild(segment);
      });
      row.appendChild(rankEl);
    }

    document.getElementById("scale-tokens").textContent = cp + "S";
    document.getElementById("scale-rollouts").textContent = "~" + cp + "x";
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

  function maskClass(query, key) {
    if (query < 4) return key <= query ? "allowed-root" : "";
    if (query < 8) {
      if (key < 4) return "allowed-root";
      return key >= 4 && key <= query ? "allowed-a" : "";
    }
    if (key < 4) return "allowed-root";
    return key >= 8 && key <= query ? "allowed-b" : "";
  }

  function renderMask() {
    var grid = document.getElementById("mask-grid");
    if (!grid) return;
    var fragment = document.createDocumentFragment();
    for (var query = 0; query < 12; query += 1) {
      for (var key = 0; key < 12; key += 1) {
        var cell = document.createElement("span");
        cell.className = "mask-cell " + maskClass(query, key);
        cell.setAttribute("aria-hidden", "true");
        fragment.appendChild(cell);
      }
    }
    grid.appendChild(fragment);
  }

  var resultData = {
    dense: {
      title: "Dense attention weak scaling",
      unit: "ms, forward + backward",
      labels: ["CP1", "CP2", "CP4", "CP8"],
      series: [
        { name: "fixed 5K", values: [17.38, 19.54, 19.98, 20.47], color: "--cp-blue" },
        { name: "varied 5K", values: [17.45, 19.72, 20.47, 20.85], color: "--cp-cyan" }
      ],
      min: 16,
      max: 22,
      note: "Global tokens: 40,960 / 81,920 / 163,840 / 327,680",
      stats: [
        ["8x", "physical tokens, CP1 to CP8"],
        ["1.178x", "fixed layer-time ratio"],
        ["0.70 ms", "CP8 exposed communication"]
      ]
    },
    glm: {
      title: "GLM indexer + sparse MLA",
      unit: "ms, forward + backward",
      labels: ["CP1", "CP2", "CP4", "CP8"],
      series: [
        { name: "operation", values: [519.3, 645.5, 633.9, 669.4], color: "--cp-coral" }
      ],
      min: 480,
      max: 700,
      note: "Global tokens: 81,920 / 163,840 / 327,680 / 655,360",
      stats: [
        ["8x", "physical tokens, CP1 to CP8"],
        ["1.289x", "operation-time ratio"],
        ["30.61 GiB", "CP8 peak allocated per rank"]
      ]
    },
    gdn: {
      title: "Qwen3.5 GDN execution",
      unit: "ms, forward + backward",
      labels: ["CP1", "CP2", "CP4", "CP8"],
      series: [
        { name: "varied 5K", values: [30.0, 35.8, 39.7, 44.1], color: "--cp-green" },
        { name: "medium-long", values: [27.1, 37.9, 41.7, 43.1], color: "--cp-cyan" },
        { name: "completion chain", values: [66.5, 78.8, 101.5, 114.2], color: "--cp-amber" }
      ],
      min: 20,
      max: 120,
      note: "Local/mixed plans and a deliberately chain-heavy control",
      stats: [
        ["1.47x", "varied 5K, CP8 / CP1"],
        ["1.59x", "medium-long, CP8 / CP1"],
        ["1.72x", "all-chain, CP8 / CP1"]
      ]
    },
    nodes: {
      title: "24-layer GLM across two H200 nodes",
      unit: "thousand packed tokens / second",
      labels: ["CP8\none node", "CP8\n4 + 4", "CP16\n8 + 8"],
      series: [
        { name: "throughput", values: [17.026, 16.339, 30.913], color: "--cp-violet", bars: true }
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
    var margin = { top: 40, right: 24, bottom: 55, left: 58 };
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

    chartState.points = [];
    data.series.forEach(function (series, seriesIndex) {
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
      context.beginPath();
      series.values.forEach(function (value, index) {
        var x = margin.left + xStep * index;
        var y = margin.top + plotHeight * (data.max - value) / span;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();

      series.values.forEach(function (value, index) {
        var x = margin.left + xStep * index;
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

      var legendX = margin.left + seriesIndex * 150;
      context.fillStyle = color;
      context.fillRect(legendX, 15, 16, 3);
      context.textAlign = "left";
      context.fillStyle = colors.text;
      context.fillText(series.name, legendX + 23, 17);
      context.textAlign = "center";
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
    renderMask();
    initResults();
    initReadingState();
  });
})();
