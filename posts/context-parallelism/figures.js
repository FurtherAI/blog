(() => {
  "use strict";

  const fmt = (value, digits = 3) => Number(value.toFixed(digits)).toString();
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const sum = (values) => values.reduce((a, b) => a + b, 0);
  const rank = (token) => [0, 1, 4, 5, 6].includes(token) ? 0 : 1;
  const visible = (q, k) => k <= q && (k < 4 || (q < 7 ? k < 7 : k >= 7));
  const tokens = (items, selected = -1) => items.map((id) =>
    `<span class="cpv-token cpv-rank-${rank(id)}${id === selected ? " cpv-selected" : ""}">${id}</span>`).join("");
  const legend = (items) => `<div class="cpv-legend">${items.map(([color, label]) =>
    `<span><i class="cpv-swatch" style="--color:var(--cp-${color})"></i>${label}</span>`).join("")}</div>`;
  const choices = (name, items, selected) => `<div class="cpv-choices" role="group" aria-label="${name}">${items.map(([key, label]) =>
    `<button type="button" data-choice="${key}" aria-pressed="${key === selected}">${label}</button>`).join("")}</div>`;
  function shell(mount, title, controls = "") {
    mount.classList.add("cpv");
    mount.innerHTML = `<div class="cpv-toolbar"><strong class="cpv-title">${title}</strong>${controls}</div><div class="cpv-body"></div>`;
    return mount.querySelector(".cpv-body");
  }
  function bindChoices(container, render) {
    container.addEventListener("click", (event) => {
      const button = event.target.closest("[data-choice]");
      if (!button) return;
      button.parentElement.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", item === button));
      render(button.dataset.choice);
    });
  }

  function capacity(mount) {
    const body = shell(mount, "One root, more completed trajectories", choices("Context parallel size", [1, 2, 4, 8].map((cp) => [String(cp), `CP${cp}`]), "1"));
    function draw(value) {
      const cp = Number(value), total = 64 * cp;
      const tree = (total - 24) / 8, flat = total / 32;
      const pieces = (isTree) => {
        const sizes = isTree ? [24, ...Array(tree).fill(8)] : Array.from({ length: flat }, () => [24, 8]).flat();
        return sizes.map((size, i) => `<span class="${(isTree ? i === 0 : i % 2 === 0) ? "cpv-root-piece" : "cpv-leaf-piece"}" style="flex:0 0 ${100 * size / total}%" aria-hidden="true"></span>`).join("");
      };
      body.innerHTML = `<p class="cpv-note">24K-token root &middot; 8K-token completions &middot; 64K physical tokens per rank</p>
        <div class="cpv-capacity-stats" aria-live="polite"><span><b>${total}K</b> global capacity</span><span><b>${tree}</b> tree trajectories</span><span><b>${flat}</b> flattened trajectories</span></div>
        <div class="cpv-capacity-row"><div><strong>Prefix tree</strong><span>Root stored once</span></div><div class="cpv-capacity-track" role="img" aria-label="24K root plus ${tree} completions of 8K each">${pieces(true)}</div></div>
        <div class="cpv-capacity-row"><div><strong>Flattened</strong><span>Root repeated per trajectory</span></div><div class="cpv-capacity-track" role="img" aria-label="${flat} copies of a 24K root and 8K completion">${pieces(false)}</div></div>
        ${legend([["blue", "Root tokens"], ["green", "Completion tokens"]])}
        <div class="cpv-equations"><span>Tree: (${total}K &minus; 24K) / 8K = <b>${tree}</b></span><span>Flattened: ${total}K / (24K + 8K) = <b>${flat}</b></span></div>
        <p class="cpv-takeaway">At CP${cp}, the tree fits <strong>${fmt(tree / flat, 4)}&times;</strong> as many complete trajectories in the same physical token budget. This is packing arithmetic, not a measured speedup.</p>`;
    }
    bindChoices(mount, draw);
    draw("1");
  }

  function ownership(mount) {
    const body = shell(mount, "Visibility and ownership are different maps", `<label class="cpv-control">Query token <select aria-label="Query token">${range(9).map((id) => `<option value="${id}"${id === 6 ? " selected" : ""}>${id < 4 ? "Root" : id < 7 ? "A" : "B"}${id}</option>`).join("")}</select></label>`);
    function draw(value) {
      const q = Number(value), owner = rank(q);
      const local = range(9).filter((k) => visible(q, k) && rank(k) === owner);
      const remote = range(9).filter((k) => visible(q, k) && rank(k) !== owner);
      body.innerHTML = `<div class="cpv-ownership-grid"><div>
          <p class="cpv-label">The logical tree</p><div class="cpv-tree-root"><b>Root</b><div class="cpv-token-row">${tokens([0, 1, 2, 3], q)}</div></div>
          <div class="cpv-tree-branches"><div><b>Branch A</b><div class="cpv-token-row">${tokens([4, 5, 6], q)}</div></div><div><b>Branch B</b><div class="cpv-token-row">${tokens([7, 8], q)}</div></div></div>
          ${legend([["blue", "Rank 0"], ["violet", "Rank 1"]])}
          <p class="cpv-note">Rank 0 owns {0, 1, 4, 5, 6}.<br>Rank 1 owns {2, 3, 7, 8}.</p>
          <p class="cpv-note">An illustrative assignment, not an optimized plan.</p>
        </div><div><p class="cpv-label">Visible KV columns for each query row</p>
          <table class="cpv-matrix" aria-label="Attention visibility, colored by KV owner"><thead><tr><th scope="col" aria-label="Query rows">q</th>${range(9).map((k) => `<th scope="col">${k}</th>`).join("")}</tr></thead><tbody>${range(9).map((row) => `<tr${row === q ? ' class="cpv-selected-row"' : ""}><th scope="row">${row}</th>${range(9).map((k) => `<td class="${visible(row, k) ? `cpv-visible cpv-rank-${rank(k)}` : "cpv-invisible"}" aria-label="Query ${row}, KV ${k}: ${visible(row, k) ? `visible, rank ${rank(k)}` : "excluded"}">${visible(row, k) ? "&#9679;" : "&middot;"}</td>`).join("")}</tr>`).join("")}</tbody></table>
        </div></div>
        <div class="cpv-query-result" aria-live="polite"><strong>Query ${q} runs on rank ${owner}.</strong><div><span>Local KVs</span><code>${local.length ? local.join(", ") : "none"}</code></div><div><span>Remote KVs to fetch</span><code>${remote.length ? remote.join(", ") : "none"}</code></div></div>
        <p class="cpv-takeaway">${q >= 4 ? `Sibling branch ${q < 7 ? "B" : "A"} is invisible, wherever its tokens live. ` : "The root cannot see either future branch. "}Changing token ownership changes communication; it does not change the attention mask.</p>`;
    }
    mount.querySelector("select").addEventListener("change", (event) => draw(event.target.value));
    draw(6);
  }

  function attentionMerge(mount) {
    const masses = [1, 2, 3, 4], values = [1, 3, 2, 8];
    const body = shell(mount, "Partial attention outputs carry unequal weight", `<label class="cpv-control">Partition after KV <select aria-label="Partition after KV"><option value="1">1</option><option value="2" selected>2</option><option value="3">3</option></select></label>`);
    function draw(value) {
      const split = Number(value);
      const partials = [[0, split], [split, 4]].map(([start, end]) => {
        const mass = sum(masses.slice(start, end));
        const numerator = sum(masses.slice(start, end).map((m, i) => m * values[start + i]));
        return { start, end, mass, numerator, output: numerator / mass };
      });
      body.innerHTML = `<p class="cpv-note">One query, four KVs. Here the positive masses are exp(score), and each value is a scalar.</p>
        <div class="cpv-kv-cells">${masses.map((mass, i) => `<div class="${i < split ? "cpv-part-a" : "cpv-part-b"}"><b>KV${i + 1}</b><span>value ${values[i]}</span><div class="cpv-mass-track"><i style="width:${mass * 25}%"></i></div><span>mass ${mass}</span></div>`).join("")}</div>
        <div class="cpv-partials">${partials.map((p, i) => `<div class="${i ? "cpv-part-b" : "cpv-part-a"}"><strong>Kernel call ${i + 1}: KV${p.start + 1}${p.end - p.start > 1 ? `&ndash;${p.end}` : ""}</strong><span>Total mass = ${p.mass}</span><span>O${i + 1} = ${p.numerator} / ${p.mass} &asymp; <b>${fmt(p.output)}</b></span><span>LSE${i + 1} = ln(${p.mass}) &asymp; ${fmt(Math.log(p.mass))}</span></div>`).join("")}</div>
        <p class="cpv-label">Recover each partition's share from LSE</p>
        <div class="cpv-weight-bar" role="img" aria-label="Merge weights ${partials[0].mass * 10} and ${partials[1].mass * 10} percent">${partials.map((p, i) => `<span class="${i ? "cpv-part-b" : "cpv-part-a"}" style="flex:${p.mass}">${p.mass * 10}%</span>`).join("")}</div>
        <div class="cpv-merge-answer" aria-live="polite"><div><span>Mass-weighted merge</span><strong>${partials[0].mass}/10 &times; (${partials[0].numerator}/${partials[0].mass}) + ${partials[1].mass}/10 &times; (${partials[1].numerator}/${partials[1].mass}) = <b>4.5</b></strong></div><div><span>Unweighted average</span><strong>(${partials[0].numerator}/${partials[0].mass} + ${partials[1].numerator}/${partials[1].mass}) / 2 &asymp; <b>${fmt(sum(partials.map((p) => p.output)) / 2)}</b></strong></div></div>
        <p class="cpv-takeaway">Every partition gives the same merged answer: (1&times;1 + 2&times;3 + 3&times;2 + 4&times;8) / 10 = <strong>4.5</strong>. Existing attention kernels already return O and LSE; those are sufficient to merge their results.</p>`;
    }
    mount.querySelector("select").addEventListener("change", (event) => draw(event.target.value));
    draw(2);
  }

  // Durations below define an illustrative dependency graph, not a profiler trace.
  function makeSchedule(delay) {
    const event = (lane, start, end, label, description) => ({ lane, start, end, label, description });
    const f1 = 3 + delay, f2 = 5 + 2 * delay, forwardEnd = 7.25 + 2 * delay;
    const reduce2 = 5.5 + delay, reduce1 = Math.max(6.5, reduce2) + 2 + delay;
    const backwardEnd = Math.max(10, reduce1 + 0.5);
    const forward = [
      event(2, 0, 0.5, "P", "Pack outgoing KV"),
      event(1, 0.5, 2.5 + delay, "F1", "Fetch remote KV block 1"),
      event(1, 2.5 + delay, 4.5 + 2 * delay, "F2", "Fetch remote KV block 2, on the same NCCL stream"),
      event(2, 2.5 + delay, f1, "G1", "Gather block 1 after its fetch completes"),
      event(2, 4.5 + 2 * delay, f2, "G2", "Gather block 2 after its fetch completes"),
      event(0, 0, 3, "L", "Local attention"), event(0, f1, f1 + 2, "F1", "Attention on remote KV block 1"),
      event(0, f2, f2 + 2, "F2", "Attention on remote KV block 2"), event(0, f2 + 2, forwardEnd, "M", "Merge partial outputs"),
    ];
    const backward = [
      event(0, 0, 3, "B2", "Backward for remote block 2; produces its dKV"),
      event(0, 3, 6, "B1", "Backward for remote block 1; produces its dKV"),
      event(0, 6, 10, "BL", "Local attention backward"),
      event(2, 3, 3.5, "P2", "Pack dKV2, after B2 has produced it"),
      event(2, 6, 6.5, "P1", "Pack dKV1, after B1 has produced it"),
      event(1, 3.5, reduce2, "D2", "Return and reduce dKV2"),
      event(1, Math.max(6.5, reduce2), reduce1, "D1", "Return and reduce dKV1; waits for packing and for the NCCL stream"),
      event(2, reduce2, reduce2 + 0.5, "A2", "Accumulate this rank's received gradients from exchange D2"),
      event(2, reduce1, reduce1 + 0.5, "A1", "Accumulate this rank's received gradients from exchange D1"),
    ];
    return {
      forward, backward, forwardEnd, backwardEnd,
      forwardWaits: [[3, f1], [f1 + 2, f2]].filter(([a, b]) => b > a),
      backwardWaits: backwardEnd > 10 ? [[10, backwardEnd]] : [],
      compute: 17.25, comm: 8 + 4 * delay, layout: 3.5,
    };
  }

  function timelineSVG(events, waits, end, width, title) {
    const vertical = width < 620, names = ["Compute", "NCCL", "Layout"];
    const left = vertical ? 34 : 80, top = 36, step = vertical ? (width - left - 8) / 3 : 62;
    const axisEnd = 14, timeScale = vertical ? 40 : (width - left - 18) / axisEnd;
    const height = vertical ? top + axisEnd * timeScale + 28 : 240;
    const point = (time, lane) => vertical ? [left + step * lane + step / 2, top + time * timeScale] : [left + time * timeScale, top + step * lane + step / 2];
    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}. All times are illustrative milliseconds.</title>`;
    for (let tick = 0; tick <= axisEnd; tick += 2) {
      const [x, y] = point(tick, 0);
      svg += vertical ? `<line class="cpv-gridline" x1="${left}" x2="${width - 8}" y1="${y}" y2="${y}"/><text class="cpv-axis" x="${left - 8}" y="${y + 5}" text-anchor="end">${tick}</text>` : `<line class="cpv-gridline" x1="${x}" x2="${x}" y1="${top}" y2="${height - 22}"/><text class="cpv-axis" x="${x}" y="22" text-anchor="middle">${tick}</text>`;
    }
    names.forEach((name, lane) => {
      const [x, y] = point(0, lane);
      svg += `<text class="cpv-lane-label" x="${vertical ? x : left - 10}" y="${vertical ? 18 : y + 5}" text-anchor="${vertical ? "middle" : "end"}">${name}</text>`;
    });
    for (const [start, finish] of waits) {
      const [x, y] = point(start, 0), length = (finish - start) * timeScale;
      svg += `<rect class="cpv-wait" x="${vertical ? x - step * 0.34 : x}" y="${vertical ? y : y - 19}" width="${vertical ? step * 0.68 : length}" height="${vertical ? length : 38}"><title>Exposed wait: ${fmt(start)} to ${fmt(finish)} ms</title></rect>`;
    }
    events.forEach((event) => {
      const [x, y] = point(event.start, event.lane), length = (event.end - event.start) * timeScale;
      const rx = vertical ? x - step * 0.34 : x, ry = vertical ? y : y - 19;
      const rw = vertical ? step * 0.68 : length, rh = vertical ? length : 38;
      const external = vertical ? rh < 18 : rw < 16;
      svg += `<g class="cpv-event cpv-event-${event.lane}"><title>${event.description}: ${fmt(event.start)} to ${fmt(event.end)} ms</title><rect x="${rx}" y="${ry}" width="${rw}" height="${rh}"/><text x="${external ? rx + rw + 7 : rx + rw / 2}" y="${ry + rh / 2 + 5}" text-anchor="${external ? "start" : "middle"}">${event.label}</text></g>`;
    });
    const [endX, endY] = point(end, 0);
    svg += vertical ? `<line class="cpv-end-line" x1="${left}" x2="${width - 8}" y1="${endY}" y2="${endY}"/><text class="cpv-axis" x="${left}" y="${endY + 22}">${fmt(end)} ms end</text>` : `<line class="cpv-end-line" x1="${endX}" x2="${endX}" y1="${top}" y2="${height - 24}"/><text class="cpv-axis" x="${endX}" y="${height - 5}" text-anchor="end">${fmt(end)} ms end</text>`;
    svg += "</svg>";
    return svg;
  }

  function schedule(mount) {
    const body = shell(mount, "Follow the dependencies across three streams", `<label class="cpv-control">Extra time per transfer <select aria-label="Extra time per transfer"><option value="0">0 ms</option><option value="1.5" selected>1.5 ms</option><option value="3">3 ms</option></select></label>`);
    let delay = 1.5;
    function draw() {
      const plan = makeSchedule(delay), total = plan.forwardEnd + plan.backwardEnd;
      body.innerHTML = `<p class="cpv-note">Illustrative schedule for one rank. Only transfer duration changes; compute and layout work stay fixed. Downstream layers are omitted.</p>
        <div class="cpv-schedule-summary" aria-live="polite"><span><b>${fmt(total)} ms</b> elapsed</span><span><b>${fmt(total - plan.compute)} ms</b> exposed wait</span><span><b>${fmt(plan.compute + plan.comm + plan.layout)} ms</b> sum of busy streams</span></div>
        <section class="cpv-timeline-section"><strong>Forward: ${fmt(plan.forwardEnd)} ms</strong><p class="cpv-note">L = local attention. F1/F2 = remote fetch and attention. P = send packing. G1/G2 = receive gathering. M = merge.</p><div data-timeline="forward"></div></section>
        <section class="cpv-timeline-section"><strong>Backward: ${fmt(plan.backwardEnd)} ms</strong><p class="cpv-note">B2/B1 = remote backward; BL = local backward. P = gradient packing, D = dKV exchange, A = owner accumulation. Each exchange sends remote dKV and receives contributions to this rank's KV. The backward clock starts at zero.</p><div data-timeline="backward"></div></section>
        ${legend([["blue", "Compute"], ["violet", "NCCL"], ["cyan", "Packing / gathering / accumulation"], ["magenta", "Exposed wait (dashed outline)"]])}
        <div class="cpv-equations"><span>Compute busy: ${fmt(plan.compute)} ms</span><span>NCCL busy: ${fmt(plan.comm)} ms</span><span>Layout busy: ${fmt(plan.layout)} ms</span></div>
        <p class="cpv-takeaway"><strong>${fmt(total)} ms is the union of these occupied time spans.</strong> Adding per-stream busy time counts overlapped intervals more than once. Forward waits end as soon as the fetched KVs have been gathered; backward finishes only after every required dKV accumulation.</p>`;
      const width = Math.floor(body.clientWidth);
      body.querySelector('[data-timeline="forward"]').innerHTML = timelineSVG(plan.forward, plan.forwardWaits, plan.forwardEnd, width, "Forward compute, NCCL, and layout streams");
      body.querySelector('[data-timeline="backward"]').innerHTML = timelineSVG(plan.backward, plan.backwardWaits, plan.backwardEnd, width, "Backward compute, NCCL, and layout streams");
    }
    mount.querySelector("select").addEventListener("change", (event) => { delay = Number(event.target.value); draw(); });
    let lastWidth = 0;
    new ResizeObserver(([entry]) => { if (entry.contentRect.width !== lastWidth) { lastWidth = entry.contentRect.width; draw(); } }).observe(body);
    draw();
  }

  function planner(mount) {
    const work = [8, 7, 6, 4, 3, 2];
    const plans = {
      tokens: { label: "Equal tokens", owners: [[0, 1, 2], [3, 4, 5]], network: [8, 4], exposed: [3, 1] },
      work: { label: "Equal query work", owners: [[0, 3, 4], [1, 2, 5]], network: [8, 10], exposed: [5, 6] },
      runtime: { label: "Shorter critical path", owners: [[0, 3, 5], [1, 2, 4]], network: [6, 4], exposed: [2, 1] },
    };
    const elapsed = (plan) => plan.owners.map((items, i) => sum(items.map((id) => work[id])) + plan.exposed[i]);
    const body = shell(mount, "Equal amounts of work need not finish together", choices("Assignment objective", Object.entries(plans).map(([key, plan]) => [key, plan.label]), "tokens"));
    function draw(key) {
      const plan = plans[key], times = elapsed(plan), critical = Math.max(...times);
      body.innerHTML = `<p class="cpv-note">Six equal-token query chunks; two ranks. Numbers below are stipulated model inputs for illustration, in milliseconds.</p>
        <div class="cpv-chunk-work">${work.map((time, id) => `<span><b>Q${id}</b>${time} ms compute</span>`).join("")}</div>
        <div class="cpv-plan-ranks">${plan.owners.map((items, i) => `<div class="cpv-plan-rank"><div><strong>Rank ${i}: ${items.map((id) => `Q${id}`).join(", ")}</strong><span>${sum(items.map((id) => work[id]))} compute + ${plan.exposed[i]} exposed = <b>${times[i]} ms</b></span></div><div class="cpv-plan-bar" role="img" aria-label="Rank ${i}, ${sum(items.map((id) => work[id]))} ms compute then ${plan.exposed[i]} ms equivalent exposed wait">${items.map((id) => `<span class="cpv-work-piece" style="width:${work[id] / 24 * 100}%">Q${id}</span>`).join("")}<span class="cpv-network-piece" style="width:${plan.exposed[i] / 24 * 100}%"></span><i class="cpv-finish-line" style="left:${critical / 24 * 100}%"></i></div><p class="cpv-note">Network busy ${plan.network[i]} ms; ${plan.network[i] - plan.exposed[i]} ms overlaps other work.</p></div>`).join("")}</div>
        ${legend([["blue", "Query computation"], ["magenta", "Exposed communication"]])}
        <p class="cpv-note">Bars collect exposed waits at the end for comparison. A real schedule can interleave those gaps with compute.</p>
        <table class="cpv-plan-table"><thead><tr><th>Assignment</th><th>Slowest rank</th></tr></thead><tbody>${Object.entries(plans).map(([name, p]) => `<tr${name === key ? ' class="cpv-table-selected"' : ""}><td>${p.label}</td><td>${Math.max(...elapsed(p))} ms</td></tr>`).join("")}</tbody></table>
        <p class="cpv-takeaway" aria-live="polite"><strong>${plan.label}: ${critical} ms.</strong> ${key === "tokens" ? "Equal token counts leave 21 ms of compute on one rank and 9 ms on the other." : key === "work" ? "Compute is exactly balanced, but exposed transfers extend the slowest rank to 21 ms." : "Allowing a little compute imbalance can reduce the completion time when the new placement also shortens exposed communication."} These three candidates illustrate the objective, not a proof of global optimality.</p>`;
    }
    bindChoices(mount, draw);
    draw("tokens");
  }

  function visibility(mount) {
    const body = shell(mount, "A window follows the branch, not the packed row");
    const cell = (id, logical, active, query = false) => `<span class="cpv-path-cell${active ? " cpv-path-visible" : " cpv-path-excluded"}${query ? " cpv-selected" : ""}"><b>${id}</b>${logical !== null ? `<small>pos ${logical}</small>` : ""}</span>`;
    const path = [0, 1, 2, 3, 7, 8];
    body.innerHTML = `<p class="cpv-note">Query B8 is at physical offset 8, but at logical position 5 on its root-to-leaf path. The window includes the current token.</p>
      <p class="cpv-label">Physical packed storage</p><div class="cpv-storage-labels"><span>Root</span><span>Branch A</span><span>Branch B</span></div><div class="cpv-storage">${range(9).map((id) => cell(id, null, id < 4 || id >= 7, id === 8)).join("")}</div>
      <p class="cpv-note">Tokens 4, 5, 6 belong to a sibling branch and are never visible to B8.</p>
      <div class="cpv-path-row"><strong>Causal: all six ancestors / self</strong><div>${path.map((id, pos) => cell(id, pos, true, id === 8)).join("")}</div></div>
      <div class="cpv-path-row"><strong>Window 3: the last three logical positions</strong><div>${path.map((id, pos) => cell(id, pos, pos >= 3, id === 8)).join("")}</div></div>
      <p class="cpv-takeaway">Window 3 selects physical tokens <strong>{3, 7, 8}</strong>. Taking the last three entries in physical storage would wrongly include sibling token 6 and miss ancestor token 3.</p>`;
  }

  function sparseMla(mount) {
    const body = shell(mount, "Canonical token IDs survive every staging decision");
    body.innerHTML = `<p class="cpv-note">Two KV stages contribute candidates for query q0. Select the global best three, breaking score ties by smaller canonical ID.</p>
      <div class="cpv-candidate-stages">${[[[0.91, 17], [0.86, 4]], [[0.91, 9], [0.72, 23]]].map((items, i) => `<div><strong>Stage ${i ? "B" : "A"}</strong><table><thead><tr><th>Score</th><th>Token ID</th></tr></thead><tbody>${items.map(([score, id]) => `<tr><td>${score.toFixed(2)}</td><td>${id}</td></tr>`).join("")}</tbody></table></div>`).join("")}</div>
      <ol class="cpv-sparse-steps"><li><strong>Merge the selected IDs</strong><div class="cpv-id-sequence"><span>9 <small>0.91</small></span><span>17 <small>0.91</small></span><span>4 <small>0.86</small></span></div><p>For q0: <code>[9, 17, 4]</code>. Equal scores put ID 9 before ID 17. Another query q1 selects <code>[17, 23, 9]</code>.</p></li>
      <li><strong>Assemble stage KVs once</strong><p>The combined buffer follows the planned KV stages: A contributes <code>[17, 4]</code>, B contributes <code>[9, 23]</code>. It can contain unselected KVs; q0 does not select KV23. The kernel's index list controls which entries each query reads.</p></li>
      <li><strong>Map IDs into combined KV storage</strong><div class="cpv-combined-kv">${[17, 4, 9, 23].map((id, offset) => `<div><small>offset ${offset}</small><b>KV ${id}</b></div>`).join("")}</div></li>
      <li><strong>Call the sparse kernel with explicit index lists</strong><div class="cpv-equations"><code>sparse_mla(q, combined_kv, kv_indices)</code><span>q0: [9, 17, 4] &rarr; offsets <b>[2, 0, 1]</b></span><span>q1: [17, 23, 9] &rarr; offsets <b>[0, 3, 2]</b></span></div></li></ol>
      <p class="cpv-takeaway">The kernel receives the same selected KVs even when their owners and temporary buffer offsets change. Its explicit-index interface is what makes this decomposition possible.</p>`;
  }

  function gdn(mount) {
    const summaries = [[0.5, 1], [0.8, 2], [0.6, -1], [0.9, 0.5]];
    const compose = ([a, b], [c, d]) => [a * c, a * d + b];
    const inclusive = summaries.reduce((out, pair) => [...out, compose(pair, out.length ? out[out.length - 1] : [1, 0])], []);
    const body = shell(mount, "Summarize in parallel, then correct with the incoming state", `<label class="cpv-control">Initial state s0 <input type="range" aria-label="Initial state s0" min="0" max="4" step="0.5" value="0"><output>0</output></label>`);
    function draw(value) {
      const initial = Number(value), entries = [[1, 0], ...inclusive.slice(0, -1)].map(([a, b]) => a * initial + b);
      const outputs = summaries.map(([a, b], i) => a * entries[i] + b), final = outputs[3];
      mount.querySelector("output").textContent = fmt(initial);
      body.innerHTML = `<p class="cpv-note">A scalar example of a root segment split across four ranks. GDN's actual state is a matrix; the same composition rule applies.</p>
        <p class="cpv-step-title"><b>1</b> Each rank summarizes its own token slice concurrently</p>
        <div class="cpv-affine-ranks">${summaries.map(([m, e], i) => `<div><strong>Rank ${i}</strong><span>M = ${m}</span><span>E = ${e}</span></div>`).join("")}</div>
        <p class="cpv-step-title"><b>2</b> Compose summaries with an affine prefix scan</p>
        <div class="cpv-scan"><div><code>(M2, E2) &#8728; (M1, E1)<br>= (M2 M1, M2 E1 + E2)</code><p>Round 1 combines neighboring summaries. Round 2 combines summaries two ranks apart. Vertical lines retain the local result; diagonal arrows carry earlier prefixes.</p></div>
          <div class="cpv-scan-network"><div>${range(4).map((i) => `<span>Rank ${i}</span>`).join("")}</div><svg viewBox="0 0 640 166" role="img" aria-label="Two scan rounds across four ranks: first offset one, then offset two"><defs><marker id="cpv-scan-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8"/></marker></defs>${range(4).map((i) => `<path class="cpv-scan-retain" d="M${80 + i * 160},10 V154"/>`).join("")}${[[0, 1, 10], [1, 2, 10], [2, 3, 10], [0, 2, 82], [1, 3, 82]].map(([from, to, y]) => `<path class="cpv-scan-message" marker-end="url(#cpv-scan-arrow)" d="M${80 + from * 160},${y} L${80 + to * 160 - 10},${y + 68}"/>`).join("")}${[10, 82, 154].map((y) => range(4).map((i) => `<circle cx="${80 + i * 160}" cy="${y}" r="6"/>`).join("")).join("")}</svg><p>Top: local maps. Middle: first round.<br>Bottom: inclusive prefix summaries.</p></div></div>
        <p class="cpv-step-title"><b>3</b> Apply the incoming state to each rank's local result</p>
        <div class="cpv-affine-ranks cpv-corrected" aria-live="polite">${entries.map((entry, i) => `<div><strong>Rank ${i}</strong><span>in <b>${fmt(entry)}</b></span><span>out <b>${fmt(outputs[i])}</b></span></div>`).join("")}</div>
        <div class="cpv-fanout"><div><span>Final root state</span><strong>${fmt(final)}</strong></div><div class="cpv-children">${["A", "B", "C"].map((name) => `<span>Child ${name}<br>starts at <b>${fmt(final)}</b></span>`).join("")}</div></div>
        <details class="cpv-details"><summary>Follow the two scan rounds numerically</summary><div class="cpv-table-scroll"><table><thead><tr><th>Summary</th>${range(4).map((i) => `<th>Rank ${i}</th>`).join("")}</tr></thead><tbody><tr><th>Local (M, E)</th>${summaries.map((p) => `<td>${p.join(", ")}</td>`).join("")}</tr><tr><th>Distance 1</th>${summaries.map((p, i) => `<td>${(i ? compose(p, summaries[i - 1]) : p).map((v) => fmt(v)).join(", ")}</td>`).join("")}</tr><tr><th>Distance 2</th>${inclusive.map((p) => `<td>${p.map((v) => fmt(v)).join(", ")}</td>`).join("")}</tr></tbody></table></div><p>Row 3 is inclusive: rank i has composed summaries 0 through i. A rank's <em>incoming</em> state uses the preceding prefix (or s0 for rank 0). The final map is 0.216 s0 + 1.112.</p></details>
        <p class="cpv-takeaway">Expensive token work is rank-local and parallel. The dependency between ranks is resolved by composing affine maps, rather than waiting for another rank to execute its entire token slice.</p>`;
    }
    mount.querySelector("input").addEventListener("input", (event) => draw(event.target.value));
    draw(0);
  }

  function mamba(mount) {
    const body = shell(mount, "Transpose token ownership into head ownership");
    function grid(heads) {
      return `<table class="cpv-head-grid" aria-label="${heads ? "Head-sharded" : "Token-sharded"} ownership"><thead><tr><th>Token</th>${range(4).map((h) => `<th>H${h}</th>`).join("")}</tr></thead><tbody>${range(8).map((t) => `<tr><th>T${t}</th>${range(4).map((h) => `<td class="cpv-rank-${heads ? Number(h >= 2) : Number(t >= 4)}">${heads ? Number(h >= 2) : Number(t >= 4)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    body.innerHTML = `<p class="cpv-note">Two ranks, eight illustrative token rows, four heads. Each cell names the rank that owns that token/head slice. The exchanged streams are x, B, C and dt.</p>
      ${legend([["blue", "Rank 0"], ["violet", "Rank 1"]])}
      <div class="cpv-mamba-panels"><div><strong>1. Before all-to-all</strong><p>Each rank has its token slice, across every head.</p>${grid(false)}</div><div><strong>2. After all-to-all</strong><p>Each rank has the full tree, for its head slice.</p>${grid(true)}<div class="cpv-native-kernel">Native SSD kernel<br>full sequence per owned head</div></div><div><strong>3. Inverse all-to-all</strong><p>Output returns to the original token owners.</p>${grid(false)}</div></div>
      <div class="cpv-z-lane"><strong>Gate z stays token-local</strong><span>Rank 0 keeps T0&ndash;T3.<br>Rank 1 keeps T4&ndash;T7.</span><span>Apply the gate after the output returns to those same owners.</span></div>
      <p class="cpv-takeaway">The transpose gives an existing SSD kernel complete sequences while preserving distributed work across heads. Gate z does not need to make the round trip.</p>`;
  }

  const scalingData = {
    dense: { title: "Dense attention", series: [
      { name: "Fixed 5K", color: "blue", values: [17.38, 19.54, 19.98, 20.47] },
      { name: "Varied 5K", color: "cyan", values: [17.45, 19.72, 20.47, 20.85] },
    ] },
    gdn: { title: "GDN", series: [
      { name: "Varied 5K", color: "green", values: [30, 35.8, 39.7, 44.1] },
      { name: "Medium long", color: "cyan", values: [27.1, 37.9, 41.7, 43.1] },
      { name: "Completion chain", color: "violet", values: [66.5, 78.8, 101.5, 114.2] },
    ] },
    glm: { title: "GLM indexer + sparse MLA", series: [
      { name: "GLM", color: "magenta", values: [519.3, 645.5, 633.9, 669.4] },
    ] },
  };
  function scaling(mount) {
    const body = shell(mount, "Weak scaling: more total work, ideally the same time");
    mount.querySelector(".cpv-toolbar").insertAdjacentHTML("beforeend", `<div class="cpv-scaling-controls">${choices("Operator", [["dense", "Dense attention"], ["gdn", "GDN"], ["glm", "GLM"]], "dense")}<label class="cpv-control">Y axis <select aria-label="Scaling units"><option value="relative">Relative to CP1</option><option value="absolute">Milliseconds</option></select></label></div>`);
    let key = "dense", absolute = false;
    function draw() {
      const data = scalingData[key], width = Math.floor(body.clientWidth), height = 324;
      const margin = { left: 46, right: 18, top: 22, bottom: 44 }, plotWidth = width - margin.left - margin.right, plotHeight = height - margin.top - margin.bottom;
      const step = absolute ? (key === "glm" ? 200 : key === "gdn" ? 30 : 6) : 0.5, ymax = step * 4;
      const x = (i) => margin.left + plotWidth * i / 3, y = (value) => margin.top + plotHeight * (1 - value / ymax);
      let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${data.title} weak scaling, ${absolute ? "milliseconds" : "runtime divided by CP1"}"><title>${data.title}: forward plus backward time as global work grows with CP size. Dashed lines show ideal weak scaling.</title>`;
      range(5).forEach((tick) => { const value = step * tick; svg += `<line class="cpv-gridline" x1="${margin.left}" x2="${width - margin.right}" y1="${y(value)}" y2="${y(value)}"/><text class="cpv-axis" x="${margin.left - 8}" y="${y(value) + 5}" text-anchor="end">${fmt(value)}${absolute ? "" : "x"}</text>`; });
      [1, 2, 4, 8].forEach((cp, i) => { svg += `<text class="cpv-axis" x="${x(i)}" y="${height - 15}" text-anchor="middle">CP${cp}</text>`; });
      (absolute ? data.series : [{ color: null, values: [1] }]).forEach((series) => { const value = series.values[0]; svg += `<path class="cpv-ideal" ${series.color ? `style="stroke:var(--cp-${series.color})"` : ""} d="M${x(0)},${y(value)} L${x(3)},${y(value)}"/>`; });
      data.series.forEach((series, s) => {
        const values = series.values.map((v) => absolute ? v : v / series.values[0]);
        svg += `<g style="--color:var(--cp-${series.color})"><path class="cpv-series" d="${values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")}"/>`;
        values.forEach((v, i) => {
          const title = `${series.name}, CP${[1, 2, 4, 8][i]}: ${fmt(series.values[i], 2)} ms, ${fmt(series.values[i] / series.values[0])} times CP1`;
          svg += s === 1 ? `<rect class="cpv-point" x="${x(i) - 4}" y="${y(v) - 4}" width="8" height="8"><title>${title}</title></rect>` : s === 2 ? `<path class="cpv-point" d="M${x(i)},${y(v) - 5} l5,5 -5,5 -5,-5 Z"><title>${title}</title></path>` : `<circle class="cpv-point" cx="${x(i)}" cy="${y(v)}" r="4.5"><title>${title}</title></circle>`;
        });
        svg += "</g>";
      });
      svg += "</svg>";
      body.innerHTML = `<p class="cpv-note">${data.title} &middot; forward + backward &middot; global work grows 1&times;, 2&times;, 4&times;, 8&times;</p>
        <div class="cpv-scaling-plot">${svg}</div>
        ${legend(data.series.map((s) => [s.color, `${s.name}: CP8 ${fmt(s.values[3], 2)} ms (${fmt(s.values[3] / s.values[0], 2)}&times; CP1)`]))}
        <p class="cpv-note cpv-ideal-key"><i></i>Dashed: ${absolute ? "each workload's CP1 time" : "1.0x CP1 time"}, the ideal weak-scaling target.</p>
        <details class="cpv-details"><summary>Exact plotted values (milliseconds)</summary><div class="cpv-table-scroll"><table><thead><tr><th>Workload</th>${[1, 2, 4, 8].map((cp) => `<th>CP${cp}</th>`).join("")}</tr></thead><tbody>${data.series.map((s) => `<tr><th>${s.name}</th>${s.values.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`;
    }
    bindChoices(mount.querySelector(".cpv-choices"), (choice) => { key = choice; draw(); });
    mount.querySelector("select").addEventListener("change", (event) => { absolute = event.target.value === "absolute"; draw(); });
    let lastWidth = 0;
    new ResizeObserver(([entry]) => { if (entry.contentRect.width !== lastWidth) { lastWidth = entry.contentRect.width; draw(); } }).observe(body);
    draw();
  }

  const renderers = { capacity, ownership, "attention-merge": attentionMerge, schedule, planner, visibility, "sparse-mla": sparseMla, gdn, mamba, scaling };
  function init() {
    document.querySelectorAll(".cp-figure [data-figure]").forEach((mount) => renderers[mount.dataset.figure](mount));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
