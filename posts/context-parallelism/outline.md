# Context Parallelism in ART

## Editorial Contract

September 9 rewrite: approximately one hour for a technical reader who knows deep
learning and distributed training but needs CP reconstructed from first principles.
Main narrative is about 10,900 words before figure text; optional derivations and
source details add about 3,450. Technical reading speed varies; figures and equations
are part of the intended reading time, not ornamental breaks.

Reference: workspace scratch/rankness_equal_data_research_map.html.

## Reading Order

1. Physical tree capacity and weak scaling, without confusing longer rows with one
   quadratically longer context.
2. One attention query, the role of its denominator, and the local O/LSE interface.
3. One small tree carried through token ownership, KV stages and exact merge.
4. Global normalization in backward, remote dKV return and parameter gradients.
5. Ring, an explicit zigzag example, irregular tree work, runtime prediction,
   bounded search and preparation cadence.
6. Logical positions, SWA, and one global learned zero-value sink.
7. GLM architecture, learned indexer/IndexShare, canonical IDs, combined KV and
   explicit sparse-kernel indices. Separate all measured kernel scopes.
8. GDN delta-rule intuition, chunk preparation, affine scan, batched tree DAG,
   convolution halo, backward states and model-shaped runtime estimation.
9. Mamba's distinct token/head transpose, local native SSD, tree boundaries,
   grouped streams and finite head-scaling limit.
10. Activation/parameter/temporary memory, recomputation, TP/EP/PP comparisons.
11. Recorded workloads and exact lengths, ideal scaling curves, preparation,
    operation and full-model/multinode evidence, and missing Mamba scaling matrix.
12. Measurement and correctness contracts, changing inputs, scope and provenance.

## Expandable Material

- Capacity/pair arithmetic.
- Stable softmax merge, empty partitions, associativity.
- Output/LSE merge adjoints and full attention gradients.
- Critical-path simulation and byte-count example.
- Learned-sink normalization and gradients.
- Proof of stage-local top-k sufficiency.
- Absorbed MLA: move key expansion into queries and value expansion after attention.
- Detailed GDN token-to-triangular-chunk derivation including output and final state.
- Affine scan composition, backward adjoints and state bytes.
- Token/head transpose and replicated B/C gradients for Mamba.
- Benchmark revision ledger and useful-MFU definition.

## Figures

All in figures.js and figures.css, mounted by data-figure in the article. Rebuilt
from scratch for this revision. Keys: capacity, ownership, attention-merge,
schedule, planner, visibility, sparse-mla, gdn, mamba, scaling.

Requirements: distinct compute/communication/layout lanes; no orange; labels not
scaled to illegibility; mobile reflow; explicit hypothetical versus measured data;
legends and axes sufficient to read without guessing what a colored bar means.

## Evidence Guardrails

- Source/benchmark snapshots are explicit, not claims about current remote HEAD.
- No 10x production sparse-MLA claim: fallback-repair and representative comparisons
  remain separate. Do not multiply unrelated percentages.
- GDN CP8 ratios 1.47/1.59/1.72 are not described as perfect scaling.
- Dense preparation is once per input/layout, not absent and not once per layer.
- Historical GLM component summaries do not reconcile additively; only qualified
  aggregate times are presented.
- No invented CP1/4/8 Mamba points.
- MagiAttention attribution is the decomposition/planning idea, not wholesale
  kernel/runtime import or a restriction to only full and causal masks.

## Review Record

Two post-writing audit/revision rounds are recorded in the project-tracking
worktree: project_tracking/blog/context_parallelism/editorial_audits_20260909.md.
Illustrative algebra probe and browser artifacts live in blog scratch. Production
ART and benchmark semantics are unchanged by this rewrite.
