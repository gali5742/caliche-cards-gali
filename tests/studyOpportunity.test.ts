import assert from "node:assert/strict";
import test from "node:test";

import {
  STUDY_OPPORTUNITY_BACKGROUND_GAP_MS,
  shouldStartNewStudyOpportunity,
} from "../lib/study/studyOpportunity";

test("a brief background switch stays in the same study opportunity", () => {
  const hiddenAt = new Date(2026, 8, 4, 12, 0, 0).getTime();
  const visibleAt = hiddenAt + STUDY_OPPORTUNITY_BACKGROUND_GAP_MS - 1;

  assert.equal(
    shouldStartNewStudyOpportunity(hiddenAt, visibleAt),
    false
  );
});

test("thirty minutes in the background starts a new study opportunity", () => {
  const hiddenAt = new Date(2026, 8, 4, 12, 0, 0).getTime();
  const visibleAt = hiddenAt + STUDY_OPPORTUNITY_BACKGROUND_GAP_MS;

  assert.equal(
    shouldStartNewStudyOpportunity(hiddenAt, visibleAt),
    true
  );
});

test("foreground events without a recorded background do not create a new opportunity", () => {
  const visibleAt = new Date(2026, 8, 4, 12, 0, 0).getTime();

  assert.equal(shouldStartNewStudyOpportunity(null, visibleAt), false);
});
