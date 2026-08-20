# Scaling the Tree: Context Parallelism in ART

Status: editorial and evidence map, not a prose draft

Working subtitle: How prefix-tree batches, distributed attention, sparse MLA,
and recurrent state machines weak-scale across GPUs and nodes.

## Purpose

This post follows [Prefix Tree Packing in ART](../prefix-tree-packing/index.html).
That post explains how ART stores a batch as one physical tree instead of replaying
every root-to-leaf sequence. This post asks the next question: how do we distribute
that tree without giving the shared work back?

The central result is stronger than the original memory motivation. For several ART
models and realistic variable-length trees, increasing context parallelism processes
roughly proportionally more tokens at nearly fixed step time and nearly fixed memory
per GPU. On the accepted 16-GPU, two-node GLM-5.2 run, doubling both context and GPU
count from 8 to 16 GPUs retained 94.6% raw weak-scaling efficiency. At fixed token
count, the CP-only topology also beat pipeline-parallel alternatives by 27-39%.

The post must make three distinctions explicit:

1. Prefix-tree packing removes repeated physical tokens. Context parallelism divides
   the resulting unique tree across ranks.
2. The same tree semantics require different distributed algorithms for dense
   attention, sparse indexed attention, and linear recurrence.
3. Some low-level kernels are adapted from upstream projects, while ART's tree
   planning, communication, exact distributed composition, and several Triton kernels
   are original. The provenance table below is the source of truth for wording.

## Authoritative snapshots

Research captured on 2026-08-20.

- Latest multinode source: `origin/austin/monarch_multinode_training` at
  `e932bff638d9efe46db73ace334656181c302544`.
- Latest Nemotron Nano source: `origin/austin/nemotron3_nano` at
  `2616d13932fac4944c8a618986fbf9d9b4523852`.
- Multinode evidence:
  `project_tracking/art/monarch_multinode_training/parallelism_scaling_report.md`.
- GLM design and evidence:
  `project_tracking/art/glm52_cp/technical_guide.md` and
  `project_tracking/art/glm52_cp/achievement_index.md`.
- GDN design and evidence:
  `project_tracking/art/megatron_bridge_model_support_skill/2026_06_29_gdn_prefix_tree_cp_execution_guide.md`
  and `project_tracking/art/pr_739_unify_shared_prefix/gdn_cp_optimization_log.md`.
- Dense-attention lab artifacts: `projects/art_harness/scratch/cp_lab/`.
- MagiAttention design notes:
  `knowledge/art_serverless/concepts/backends/official_magi_attention_for_art.md`.

Before publication, refresh remote revisions and attach every displayed number to an
immutable ART commit, harness commit, command, raw artifact, and summary.

### Source map for drafting

Use these files when turning the map into precise code illustrations:

- Dense CP IR and planning: `src/art/megatron/context_parallel/types.py`,
  `builder.py`, and `runtime.py`.
- Dense execution and communication: `executor.py`, `comm.py`, `range_ops.py`,
  `block_mask.py`, and `core_attention.py` in the same package.
- GLM indexer and sparse MLA integration: `src/art/megatron/glm52/`, especially
  `tilelang_sparse_mla.py`.
- DeepSeek sparse-kernel lineage and adaptations:
  `src/art/megatron/dsv4/kernel/tilelang_{indexer,sparse_mla}_{fwd,bwd}.py`.
- GDN execution: `src/art/megatron/gdn/gdn_prefix_tree.py`, `fla_cp.py`,
  `fla_cp_kernels.py`, `conv_gelu.py`, and `segment_layout.py`.
- Generic recurrent contract on the Nemotron branch:
  `src/art/megatron/recurrent/{contract,prefix_tree,buckets,gdn_adapter}.py`.
- Mamba tree execution on the Nemotron branch:
  `src/art/megatron/mamba/{operator,exchange,adapter}.py`.

The Mamba source pins `mamba-ssm==2.3.2.post1` at upstream revision
`e9594ce1c732d97440f0332fdc43170a2294dbfa`; keep that version in any reproduced
kernel comparison.

## Claim hierarchy

### Headline claims supported now

- ART can preserve exact prefix-tree attention semantics while distributing tokens
  across ranks and overlapping most KV communication with local attention.
- Dense attention weak-scales strongly on fixed, varied, dominant-family,
  medium-long, and long-completion trees.
- GLM-5.2's distributed indexer finds the same canonical global top-k keys as a
  single-rank tree, then runs one combined sparse MLA operation.
- GDN uses a different CP decomposition: local recurrent work plus composable affine
  state summaries, rather than replaying the full prefix or serially piping all tokens.
- Whole-model GLM training retained 94.6% raw node-add weak-scaling efficiency from
  one 8-GPU node to two, while doubling tokens from 64K to 128K.
- At the same token count, CP-only GLM training was materially faster than PP2 and
  PP4 controls on the tested 8- and 16-GPU topologies.

### Claims that need one more publication gate

- Dense-attention operation charts need reruns on the latest multinode remote. The
  existing results are strong but came from an older prefix-tree PR snapshot.
- "CP beats TP" needs a matched fixed-token, fixed-model topology comparison. The
  accepted report directly supports CP versus PP, not every possible TP topology.
- SWA and attention-sink semantics are implemented and correctness-tested, but each
  deserves a small latest-source performance check before claiming zero overhead.
- Nemotron Nano Mamba-2 tree execution is implemented, but no authoritative
  throughput matrix was found. Present it as the new generalization until a fresh
  correctness and weak-scaling gate exists.
- GDN weak scaling is useful and general, but all-chain recurrent workloads do not
  match the near-flat dense-attention curves. Show this honestly.

### Framing to avoid

- Do not say context parallelism literally provides unlimited throughput. Say that,
  in the idealized limit where rollout supply and packing keep filling longer rows,
  usable trajectories per step can grow nearly with CP width while per-rank work is
  nearly fixed.
- Do not describe the sparse MLA kernel, FLA recurrence, Mamba SSD scan, FlexAttention,
  or FlashAttention as invented by ART.
- Do not add nested NVTX range totals as if they were wall time. Explain overlap with
  interval-union or exposed-time measurements.
- Do not hide one-time planning, mask construction, compilation, or specialization
  outside the measured system. Report their cadence separately from per-layer work.

## Narrative map

### 1. The row got longer

Open with an RL batch that has a long shared prompt and many long rollouts. Prefix-tree
packing means the prompt is stored and computed once, so a longer packed row can add
mostly new completion tokens instead of repeated prompt tokens.

For one prompt of length `P` and `m` completions with lengths `C_i`:

```text
flattened physical tokens = m * P + sum(C_i)
tree physical tokens      = P + sum(C_i)
linear-token work saved   = (m - 1) * P
attention prefix pairs saved = (m - 1) * P * (P + 1) / 2
```

Under a row capacity `S`, equal completion length `C` gives the rough contrast:

```text
independent sequences per row ~= S / (P + C)
tree completions per row       ~= (S - P) / C
```

Use `5K + 16 x 100` only as a compact diagram, not as the proof workload. It makes
the arithmetic vivid: the tree has about 6.6K unique tokens while flattening has
about 81.6K. Then immediately show medium-long and long-completion examples so the
post cannot be mistaken for an optimization specialized to short rollouts.

Transition: one GPU eventually runs out of memory even though the tree removed the
redundancy. Context parallelism makes the physical row grow with the machine.

### 2. Weak scaling is the actual target

Define weak scaling before describing implementation:

```text
CP1: S useful physical tokens on one rank
CPN: N * S useful physical tokens across N ranks
target: nearly the same step time and memory per rank
```

Contrast this with strong scaling, which keeps total tokens fixed and asks N ranks to
finish faster. ART cares about both, but weak scaling maps directly to more rollouts
per update, less repeated prefix work, and larger feasible training examples.

State the systems challenge: conventional sequence/ring CP assumes a dense causal
sequence with a simple contiguous ordering. ART has a forest of variable-depth tree
segments, arbitrary completion lengths, sparse visibility, and sometimes recurrent
state rather than attention KV.

### 3. The MagiAttention insight, translated into ART

Explain the conceptual inheritance precisely. A prefix-tree attention mask is a union
of simple rectangles. For each segment, queries can see every ancestor in full and
the segment itself causally:

```python
for segment in tree.topological_order:
    for ancestor in segment.ancestors:
        emit_full_slice(q=segment, kv=ancestor)
    emit_causal_slice(q=segment, kv=segment)
```

MagiAttention showed that arbitrary masks can be represented as FULL/CAUSAL attention
slices, assigned by a load-balancing solver, moved with fine-grained communication,
and recombined exactly. ART adopted that abstraction and systems direction.

Then draw the boundary. ART did not import MagiAttention's FFA CUDA kernel,
GroupCast/GroupReduce collectives, symmetric-memory transport, or Megatron fork. ART
implemented a self-contained executor around PyTorch FlexAttention or FlashAttention
4, NCCL all-to-all, ART planning/cache integration, and custom Triton range kernels.

This section should link to:

- MagiAttention: https://github.com/SandAI-org/MagiAttention/
- MagiAttention design: https://sandai-org.github.io/MagiAttention/docs/main/blog/magi_attn

### 4. Dense attention: schedule rectangles, not sequences

Walk one forward pass from owned hidden states to output:

```python
plan = planner.assign(attention_slices, rank_costs)
remote_kv = launch_async_kv_exchange(plan)
q_local = gather_owned_queries_on_side_stream(plan)

partials = [run_local_attention(q_local, local_kv)]
for stage in plan.remote_stages:
    kv = remote_kv.wait_for(stage)
    partials.append(run_attention(q_local, kv, stage.mask))

output, lse = merge_partials_exactly(partials)
```

The merge is not an approximation. If two stages return `(O_a, L_a)` and `(O_b, L_b)`:

```text
L = logaddexp(L_a, L_b)
O = exp(L_a - L) * O_a + exp(L_b - L) * O_b
```

That associative merge lets the planner choose stage boundaries for balance and
overlap without changing attention semantics.

Backward mirrors the ownership:

- Replay local and remote attention stages.
- Scatter-add `dQ` to query owners.
- Return and reduce `dK/dV` asynchronously to KV owners.
- Include empty ranks in the same collective wave ordering so no rank can skip a
  collective and deadlock the group.

Explain the custom performance work:

- Head-major Triton range gather and reduce kernels.
- A fused stage-merge backward.
- Query gather on a side stream.
- Lazy gradient accumulators and fewer layout conversions.
- Exact sparse block metadata construction without dense mask materialization.

Existing measured impact for the executor-only optimization series was 3.7% on a CP2
attention lab point and 5.4% across 32 changing sequences. These are supporting
numbers, not the headline scaling chart.

### 5. One executor, more attention semantics

#### Sliding-window attention

SWA is not a second CP path. It adds a logical-position constraint to the same tree
visibility graph. A query can see ancestors and its causal segment only when their
logical positions fall inside the window. The key word is logical: packed physical
token order is not a substitute for the model's `input_pos`.

Sparse block topology can conservatively include a boundary block; the exact mask
predicate resolves partial blocks. ART removed the earlier per-token CPU refinement,
preserving exact boundary semantics without a second planning path.

#### Attention sinks

An attention sink is an extra denominator logit, not another physical key. Each stage
cannot add it independently or the sink would be counted multiple times. ART merges
all ordinary stages first, then applies the sink once to the global LSE and computes
its exact backward contribution.

Use a three-panel figure: full causal tree, the same tree clipped by SWA, and the same
distributed softmax with one global sink.

### 6. GLM-5.2: the mask is sparse and selected by another model

GLM-5.2 adds a learned indexer in front of sparse MLA. The indexer scores raw token
IDs, and each query chooses a canonical top-k set of visible keys. IndexShare layers
reuse routes from a full indexer layer.

The distributed algorithm is:

1. Reuse the generic prefix-tree attention plan and KV movement.
2. Score each tree-valid local or remote candidate stage.
3. Merge stage candidates into the exact global top-k using raw token IDs and a stable
   canonical tie order.
4. Keep routes on the query owner and remap global IDs once into a concatenated KV row
   space.
5. Run one combined sparse MLA forward/backward over all planned KVs.
6. Split `dKV` at immutable stage boundaries and reduce each portion to its owner.

The "one combined sparse operation" detail matters. Running one sparse kernel per
communication stage increased launches and memory; combining stages improved a CP2,
S1024, top-k-128 operation from 4.525 to 3.414 ms and reduced peak memory from 0.415
to 0.243 GiB.

Kernel provenance must be in the prose, not hidden in an appendix. ART's TileLang
sparse MLA kernel is adapted from Miles GLM and TileLang's DeepSeek-V3.2 sparse MLA
work. ART's original contributions include:

- Exact distributed prefix-tree index selection.
- Canonical raw-ID top-k merging and route remapping.
- Combined-KV CP execution and immutable gradient split/reduction.
- Dynamic Q/K extents without recompiling on token count.
- Natural-log public LSE with exp2 internals.
- Invalid-route sentinel handling, TP head padding, numeric fixes, and four FP32 dKV
  shards to reduce atomic contention.
- Subsequent SM100/TCGEN tuning for Blackwell.

### 7. Recurrent layers: the tree is an execution DAG

Attention can evaluate independent rectangles in almost any order and merge softmax
partials. GDN and Mamba-2 instead pass a small state from parent to child. For them,
the prefix tree is an execution DAG: a child becomes ready when its parent's final
state exists.

Introduce one generic contract:

```python
class LinearRecurrentContract:
    partition_kind: Literal[
        "token_sharded_chain",   # GDN
        "head_sharded_full_tree",  # Mamba-2
    ]
```

The shared abstraction owns tree dependencies, parent-state tables, canonical segment
metadata, exchange plans, and depth scheduling. The layer family supplies its state
shape, local kernel, summary composition, and alignment constraints.

### 8. GDN: token-sharded recurrence with affine summaries

GDN has two stateful pieces:

- A causal convolution needs the last `K - 1` projected tokens from the parent path.
- Gated delta recurrence needs a matrix state per head.

The planner can execute a segment locally on one rank or chain-shard its tokens across
ranks. "Chain" does not mean serially replaying all tokens rank by rank. Each rank's
local recurrence can be summarized as an affine transform:

```text
state_out = transition * state_in + emitted_state
```

Affine summaries compose associatively. ART uses a distributed prefix/suffix scan to
find each rank's true initial state, while token-heavy recurrence runs locally in
parallel. Convolution exchanges only the small `K - 1` tails required at boundaries.

ART's original GDN work includes:

- A true-varlen causal-conv-plus-activation Triton forward/backward supporting GELU
  and SiLU.
- Compact segment gather/scatter and recurrent-input preparation kernels.
- Convolution-tail forward/backward scans.
- A native FLA CP wrapper exposing initial and final states and custom backward
  summary preprocessing.
- Autograd-aware hidden/state all-to-all at GDN-island boundaries.
- Shape-stable Triton runtime arguments for token and segment counts.
- A runtime planner based on measured compute throughput, transfer bytes, summary
  bandwidth, latency, and model dimensions.

FLA supplies the gated-delta recurrence math and underlying chunk kernels. ART supplies
the tree semantics, distributed state composition, communication, planning, and the
varlen convolution path.

Be candid in results: local/mixed GDN workloads weak-scale well, while all-chain cases
pay visible summary-scan and layout costs. This is a useful contrast with attention,
not a result to hide.

### 9. Nemotron Nano: Mamba-2 takes the other partition

Nemotron's Mamba-2 implementation reuses the recurrent tree contract but chooses the
other partition. Instead of splitting a segment's tokens into a cross-rank chain, it
all-to-alls projected streams so each rank receives all canonical tree tokens for a
subset of heads/features.

```text
attention/token layout
    -> one variable all-to-all of z, x, B, C, dt
head-sharded full tree
    -> varlen SiLU causal convolution per physical segment
    -> root-to-leaf Mamba chunk scans
    -> inverse all-to-all
attention/token layout
```

This avoids cross-rank recurrent dependencies because every rank has the full token
tree for its own state-space heads. ART uses its custom varlen convolution and the
official `mamba_ssm` SSD combined scan with FP32 states.

Original ART work here is the generic recurrent contract, prefix-tree scan
bucketization, head/group exchange plan and autograd, and exact canonical state replay.
Do not claim a custom ART SSD kernel. This section should be written as a design
generalization until the Nemotron branch passes the publication benchmark matrix.

References:

- Mamba-2 paper: https://arxiv.org/abs/2405.21060
- Official Mamba implementation: https://github.com/state-spaces/mamba
- Nemotron Nano model: https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8

### 10. Planning is part of the runtime

The planner is not merely balancing token counts. Different stages have different
kernel throughput, communication volume, summary size, latency, and overlap. ART's
planners predict runtime from measured throughput and bandwidth as functions of model
shape, then minimize the maximum exposed rank time.

Preparation runs asynchronously ahead of model execution where possible. Plans and
compiled kernels must tolerate varying token and segment counts; specializing on
`TOTAL_TOKENS` would make realistic changing rollouts spend the job recompiling.

This section should distinguish cadence:

| Work | Cadence | Where to report it |
|---|---|---|
| Tree parsing and packing | once per packed training input | input preparation |
| Attention/GDN planning | once per changing tree/layout | preparation wall and overlap |
| Sparse block metadata | once per attention plan | preparation wall |
| Kernel compilation/autotune | cold per distinct static signature | cold-start appendix |
| Forward/backward | every layer, every step | hot path |
| Layout exchange | island or layer boundary as specified | exposed versus hidden time |

No timing range added for the post should live in production ART. Use harness/lab-side
NVTX instrumentation and report overlap-corrected wall time.

### 11. Results: operation to two nodes

Present evidence in this order so each chart answers one question.

#### A. Does dense tree attention itself weak-scale?

Rerun the Qwen3.5-35B-shaped attention lab on the latest remote. Existing reference
numbers, shown here only to define expected territory:

| Workload | CP1 | CP2 | CP4 | CP8 | Interpretation |
|---|---:|---:|---:|---:|---|
| Fixed 5K + 16x100 | - | 19.54 | 19.98 | 20.47 | nearly flat for 4x tokens from CP2 to CP8 |
| Varied 5K + 16x100 | - | 19.72 | 20.47 | 20.85 | changing completion lengths remain flat |
| Varied medium-long | - | 31.80 | 33.79 | 34.68 | larger remote stages remain efficient |
| Varied dominant family | 43.07 | 53.31 | 54.96 | 56.83 | skew costs one initial step, then flattens |
| True completion chain | 366.13 | 382.35 | 394.82 | 403.83 | long chained visibility still weak-scales |

Times are hot forward plus backward milliseconds per layer. The fixed CP2/4/8 Nsight
references exposed only about 0.53/0.54/0.70 ms of forward-plus-backward communication;
most NCCL time overlapped local attention. Recompute those values from interval unions
on the publication rerun.

#### B. Does a learned sparse indexer weak-scale?

Use the accepted GLM-5.2 operation matrix:

| CP | Global tokens | Fwd+bwd | CP1-normalized time | Peak allocated/rank |
|---:|---:|---:|---:|---:|
| 1 | 81,920 | 519.3 ms | 1.000x | 29.43 GiB |
| 2 | 163,840 | 645.5 ms | 1.243x | 30.35 GiB |
| 4 | 327,680 | 633.9 ms | 1.221x | 29.86 GiB |
| 8 | 655,360 | 669.4 ms | 1.289x | 30.61 GiB |

This is 8x the tokens at 1.289x the operation time with essentially flat memory per
rank. Include the CP8 breakdown: indexer 166.5 ms, sparse attention forward 138.1 ms,
backward 442.5 ms. Planning was 87.2 ms once per changing plan, not per model layer.

#### C. Does the full model retain the result?

Use the accepted four-layer variable-shape GLM result:

| CP | Step time | Useful MFU | Peak allocated/rank |
|---:|---:|---:|---:|
| 1 | 4.994 s | 22.44% | 94.90 GiB |
| 2 | 5.644 s | 19.89% | - |
| 4 | 5.803 s | 19.35% | - |
| 8 | 5.880 s | 19.10% | 73.49 GiB |

Eight times the tokens cost 1.177x the step time. Fill the two missing memory cells
from the authoritative artifact before layout.

#### D. Does it survive the node boundary?

The strongest full-model ladder is the completion-heavy 24-layer GLM run:

| Topology | Tokens | Step | Throughput | Useful MFU |
|---|---:|---:|---:|---:|
| CP8/EP8, one node | 64K | 3.849 s | 17,026 tok/s | 15.43% |
| CP8/EP8, split 4+4 | 64K | 4.011 s | 16,339 tok/s | 14.81% |
| CP16/EP16, two nodes | 128K | 4.240 s | 30,913 tok/s | 14.33% |

- Splitting the same topology across nodes retained 95.96% throughput.
- Adding the second node and doubling tokens retained 94.60% raw weak-scaling
  efficiency.
- Useful MFU retention was 96.78%.

The varied medium-long ladder was stronger still: 99.41% local weak scaling, 95.30%
placement retention, and 98.93% node-add weak scaling.

#### E. Why not pipeline parallelism?

At fixed work, use the accepted controls:

| GPUs / tokens | CP-only | PP2 | PP4 |
|---|---:|---:|---:|
| 8 / 64K | 14,011 tok/s | 11,024 tok/s | - |
| 16 / 128K | 27,964 tok/s | 21,610 tok/s | 20,134 tok/s |

The gap is not primarily bytes on the PP links. It comes from pipeline bubbles, stage
imbalance, and source ownership. Phrase this as a result for these matched GLM
topologies, not a universal theorem about PP.

#### F. Where do GDN and Mamba land?

Use one internally consistent latest-source GDN matrix after rerunning. Expected
Qwen3.5-shaped territory from existing artifacts:

- Varied 5K + 16x100: about 30.0/35.8/39.7/44.1 ms at CP1/2/4/8.
- Varied medium-long: about 27.1/37.9/41.7/43.1 ms.
- True completion chain: about 66.5/78.8/101.5/114.2 ms.
- Model-shape check at CP4 varied 5K: 35B 39.7 ms, 9B 42.1 ms, 397B 67.6 ms.

The exact table must come from one commit and one harness revision. Add Mamba only
after the Nemotron publication gate; a design-only figure is acceptable for v1.

### 12. What did not become free

Close the technical argument with limits rather than marketing language:

- CP cannot create rollout supply; generation or data availability may become the
  bottleneck.
- Prefix-tree gains depend on actual token sharing. Unrelated sequences still gain
  capacity from CP but not prefix reuse.
- Recurrent all-chain workloads expose state-summary communication more than dense
  attention exposes KV movement.
- Planner and metadata time matters when inputs change every step, even when hidden
  behind model compute in steady state.
- Sparse MLA backward remains the largest GLM operation bucket.
- Cross-node bandwidth and topology matter; the reported result is H200 and the
  documented two-node placement, not a universal fabric claim.
- Compilation must remain shape-stable across realistic token-count variation.

End by returning to the initial motivation: ART set out to fit a longer tree. The
surprise was that, for these models and workloads, distributing the tree often costs
less than adding model parallelism, while the longer row itself produces more useful
RL work.

## Figure storyboard

Keep the main post to eight figures. Put complete matrices and profiler tables in an
appendix or expandable details blocks.

1. **Hero - one tree across ranks.** A physical prefix tree spans CP ranks. Overlay
   blue FULL/CAUSAL attention rectangles and green recurrent state arrows. The visual
   should immediately show that tokens are stored once.
2. **Why longer context produces more trajectories.** Side-by-side flattened and tree
   arithmetic for a long prompt with multiple rollouts, followed by CP1/2/4/8 rows
   growing horizontally while per-rank width remains fixed.
3. **From Magi slices to ART stages.** Left: tree mask decomposed into rectangles.
   Middle: planner assigns rectangles and token ranges. Right: ART's own
   FlexAttention/FA4 plus NCCL executor. Include a small "inspired / implemented"
   boundary.
4. **Dense forward/backward timeline.** Rank swimlanes showing local KV compute,
   asynchronous all-to-all, ready remote stages, exact LSE merge, then dQ scatter and
   dKV return. Shade only exposed communication.
5. **Three attention semantics, one executor.** Full causal tree, SWA logical window,
   and one global attention sink.
6. **GLM-5.2 route and sparse MLA.** Per-stage candidate scores merge into canonical
   raw-ID top-k, remap once into combined KV, one sparse kernel, split/reduce dKV.
7. **Two recurrent partitions.** GDN token-sharded chain with affine prefix scan versus
   Mamba-2 head-sharded full tree with one A2A around the island.
8. **Evidence ladder.** A compact multi-panel result: dense operation weak scaling,
   GLM time and memory, and the one-node/two-node whole-model throughput ladder.

Optional appendix figures:

- Workload gallery: fixed, varied, dominant, nested, ragged, medium-long, and true
  completion-chain trees.
- Planner prediction versus measured runtime and preparation cadence.
- CP-only versus PP2/PP4 fixed-token bars.
- GDN breakdown separating local compute, summary scan, convolution tails, layout,
  and exposed NCCL.

## Worked examples

### Example A: compact shared prompt

`P=5,000`, `m=16`, `C=100`:

```text
flattened = 16 * (5,000 + 100) = 81,600 tokens
tree      = 5,000 + 16 * 100   = 6,600 tokens
```

Use this only to teach the representation. ART includes branch-boundary context tokens
and packing details, so label the arithmetic illustrative.

### Example B: a depth-three tree

Use a fixed-length root with independently varied descendants:

```text
system root (4K)
  task family A (8-12K)
    prompt A1 (2-4K) -> four variable completions
    prompt A2 (2-4K) -> four variable completions
  task family B (6-10K)
    prompt B1 (2-4K) -> four variable completions
```

Walk this same tree through:

- Dense attention rectangle construction.
- SWA clipping by logical position.
- GLM candidate top-k merge.
- GDN parent-state readiness.
- Mamba head-sharded canonical replay.

Using one example across sections will make the different algorithms comparable.

### Example C: exact two-stage softmax merge

Give tiny numeric LSE values and show that stage order does not change the result. This
is the clearest correctness intuition for freely scheduling attention rectangles.

### Example D: affine recurrent composition

For summaries `f(s)=A*s+B` and `g(s)=C*s+D`, show:

```text
g(f(s)) = (C*A) * s + (C*B + D)
```

That one line explains why ranks can scan summaries instead of sending every recurrent
token state serially.

## Provenance ledger

| Component | Source/inspiration | ART contribution | Safe wording |
|---|---|---|---|
| Attention slice IR | MagiAttention FULL/CAUSAL slices | Prefix-tree builder, ART cost model and integration | "Inspired by MagiAttention's slice decomposition" |
| Fine-grained overlap | MagiAttention architecture | NCCL A2A executor, streams, work handles, empty-rank ordering | "ART implemented its own executor around standard PyTorch/NCCL primitives" |
| Local dense kernel | PyTorch FlexAttention / FlashAttention 4 | Stage construction, metadata, exact multi-stage composition | "ART schedules upstream local attention kernels" |
| Range movement | Triton programming model | ART head-major range gather/reduce and fused merge backward | "Custom ART Triton kernels" |
| SWA | Model semantics and FlexAttention masks | Logical-position tree integration and removal of CPU token refinement | "ART extends the same tree executor to SWA" |
| Attention sink | GPT-OSS/DSV4 semantics | One-time global denominator merge and exact distributed backward | "ART's distributed sink composition" |
| Sparse MLA | Miles GLM and TileLang DeepSeek-V3.2 kernels | CP combined-KV kernel adaptation, dynamic extents, numerics, SM100 tuning | "Adapted and substantially extended, not invented from scratch" |
| Distributed indexer | GLM-5.2 model design | Exact tree-valid distributed scoring, canonical top-k and route sharing | "Original ART distributed prefix-tree indexer" |
| GDN recurrence | FLA gated-delta kernels | Tree DAG, affine summary scan, CP wrapper and orchestration | "FLA math inside ART's distributed tree runtime" |
| Varlen causal conv | Megatron design reference and Triton | ART true-varlen GELU/SiLU forward/backward and tail-state scans | "Custom ART varlen convolution kernels" |
| Mamba SSD scan | Official `mamba_ssm` | Tree bucketing, head/group A2A, state replay, shared recurrent contract | "Official Mamba scan inside ART's prefix-tree runtime" |

Every final kernel-performance claim should cite its implementation commit and artifact,
not only this editorial ledger.

## Publication benchmark contract

### Input semantics

- Use Qwen3.5-35B tensor shapes for dense-attention and GDN labs, confirmed against a
  loaded model/config.
- Weak scaling means global packed length grows by CP size while each rank's target
  physical tokens stay fixed.
- Scale by adding families/completions until the row fills. Do not multiply one
  family's prefix and completion lengths by CP size.
- Fixed means exact repeated completion lengths.
- Every other workload samples completion lengths independently for each measured
  forward/backward sequence.
- Warmup inputs must be disjoint from measured inputs. Report tail-16 median, p95, and
  worst case across at least 16 changing sequences; increase to 64 when specialization
  needs a longer horizon.

### Timing semantics

- Report tree parse, planning, block metadata, cold compile/autotune, forward,
  backward, and exposed communication separately.
- State whether each preparation cost occurs once per model, once per packed input,
  once per plan, or once per layer.
- Use harness/lab-only NVTX ranges and Nsight Systems interval-union attribution.
- Report max-rank wall time and rank imbalance; do not average away a straggler.
- For full training, compile should be enabled after a disjoint warmup period.
- Layer timing and GPU memory hooks must be disabled for clean max-throughput runs;
  use separate attribution and memory runs.

### Required workload coverage

Dense attention and GDN must run the same semantic workload set:

1. Fixed `5K + 16x100`.
2. Varied `5K + 16x~100`.
3. Varied dominant family.
4. Varied medium-long.
5. True completion chain.
6. Depth-three shared roots.
7. Ragged/nested tree.

Add architecture-specific cases without replacing the shared matrix:

- SWA boundary-heavy logical positions.
- Attention sink enabled/disabled matched pair.
- GLM IndexShare and full-indexer layers.
- GDN all-local, mixed local/chain, and all-chain plans.
- Mamba head-shard divisibility, empty segments, and variable chunk boundaries.

### Reported outputs

- Hot forward, backward, and total time per layer.
- Preparation and planning wall time and how much is exposed.
- Exposed communication, total communication, and achieved bandwidth.
- Peak allocated and reserved CUDA memory per rank.
- Kernel launches and deepest-range kernel time for representative CP2/4/8 runs.
- Whole-model tokens/s, trajectories/s when meaningful, step time, and useful MFU.
- Weak-scaling efficiency and fixed-token topology comparison.
- Exact ART/harness commits and model/topology/recompute/precision configuration.

## Work remaining before prose

1. Rerun dense attention and GDN's shared workload matrix on the latest multinode
   remote with independently varied measured sequences.
2. Produce one latest-source Nsight CP2/4/8 timeline with overlap-corrected exposed
   communication for the dense executor.
3. Add small SWA and attention-sink performance controls.
4. Run Nemotron Mamba-2 correctness, changing-shape specialization, operation weak
   scaling, and at least one whole-model point.
5. Decide whether to run a matched CP-versus-TP control. Until then, use only the
   measured CP-versus-PP wording.
6. Resolve the one late dense-attention CP8 backward outlier in the old varied-5K run
   or show it is absent in the latest rerun.
7. Fill missing full-model memory cells and lock all displayed artifacts to commits.
8. Draft figures 1-4 first. They establish the visual language reused by GLM, GDN,
   and Mamba.

## Likely final structure and length

- Opening and prefix-tree payoff: 700-900 words.
- MagiAttention lineage and dense executor: 1,500-1,900 words.
- SWA, sink, and GLM sparse MLA: 1,200-1,500 words.
- GDN and Mamba recurrent execution: 1,300-1,700 words.
- Planning, benchmarks, limits, conclusion: 1,200-1,500 words.
- Main body target: 6,000-7,500 words, plus expandable benchmark/provenance appendix.

The draft should remain one narrative rather than four model-specific mini-posts. The
prefix tree is the common data structure; the algebra of the layer determines how ART
distributes it.
