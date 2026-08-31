# Free review sampling

Free review is intentionally separate from scheduled FSRS review.

## Eligibility

Only review items that belong to the currently unlocked textbook range, are enabled, and already have persisted review state are eligible. Vocabulary that has never entered the review system is not pulled into free review.

## Sampling

Each free-review session samples up to 20 eligible review items without replacement. The sample is weighted using the existing FSRS state. Higher weight is given to items that are due or near due, have higher difficulty, lower stability, more lapses, or have progressed further through their current interval.

Stable or recently reviewed items keep a non-zero chance of selection so practice does not collapse into a deterministic weak-item list. Recognition and production use their own independent FSRS states. When both skills for the same vocabulary item are selected, the queue tries to keep at least three intervening items between them when enough alternatives are available.

A new free-review session samples again.

## Read-only boundary

Free review reads persisted ReviewItem and FSRS state only. Advancing with `下一个` does not call the scheduled review commit path, does not change FSRS state, and does not append ReviewEvent records. Only scheduled review ratings update FSRS state.
