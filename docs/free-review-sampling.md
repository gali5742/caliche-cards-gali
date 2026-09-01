# Free review sampling

Free review is intentionally separate from scheduled FSRS review.

## Eligibility

Only review items that belong to the currently unlocked textbook range, are enabled, and already have persisted review state are eligible. Vocabulary that has never entered the review system is not pulled into free review.

## Sampling

Each free-review session samples up to 20 eligible review items without replacement. The base sample weight uses the existing FSRS state. Higher weight is given to items that are due or near due, have higher difficulty, lower stability, more lapses, or have progressed further through their current interval.

Stable or recently reviewed items keep a non-zero chance of selection so practice does not collapse into a deterministic weak-item list. Recognition and production use their own independent FSRS states. When both skills for the same vocabulary item are selected, the queue tries to keep at least three intervening items between them when enough alternatives are available.

A new free-review session samples again.

## Same-day exposure cooling

Free review keeps a separate, local, same-day exposure record so a weak item does not dominate repeated practice sessions just because its FSRS state remains unchanged. The exposure record is keyed by ReviewItem, so recognition and production cool independently.

Only an item that actually becomes the current visible practice card is counted as exposed. Merely being sampled into a session is not enough.

The FSRS-derived sampling weight is multiplied by an exposure factor:

- after the first same-day exposure: `0.35`
- after the second same-day exposure: `0.15`
- after the third and later same-day exposures: `0.05`

A time-based cooldown is multiplied on top of that:

- shown within the last 30 minutes: `0.10`
- 30–60 minutes ago: `0.25`
- 1–3 hours ago: `0.60`
- more than 3 hours ago: `1.00`

For example, an item seen once less than 30 minutes ago receives `0.35 × 0.10 = 0.035` of its otherwise-current free-review sampling weight. Cooling never makes the item ineligible; a small pool can still select it.

Exposure state is local-only and resets by local calendar day. It is not a learning-history record and is intentionally separate from FSRS state and ReviewEvent history.

## Read-only boundary

Free review reads persisted ReviewItem and FSRS state only for scheduling. Advancing with `下一个` does not call the scheduled review commit path, does not change FSRS state, and does not append ReviewEvent records. The local exposure-cooling record is the only free-review write, and it affects only later free-review sampling. Only scheduled review ratings update FSRS state.
