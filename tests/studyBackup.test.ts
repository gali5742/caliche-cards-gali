import assert from "node:assert/strict";
import test from "node:test";
import { State } from "ts-fsrs";

import { FSRS_PAYLOAD_VERSION } from "../lib/srs/fsrsTypes";
import {
  parseStudyBackup,
  STUDY_BACKUP_FORMAT,
  STUDY_BACKUP_VERSION,
  type StudyBackup,
} from "../lib/storage/studyBackup";
import { STUDY_DB_VERSION } from "../lib/storage/studyDb";

function makeValidBackup(): StudyBackup {
  const now = new Date(2026, 8, 3, 12, 0, 0).getTime();
  const reviewItemId = "fr:bonjour-francais:v1:recognition";

  return {
    format: STUDY_BACKUP_FORMAT,
    version: STUDY_BACKUP_VERSION,
    dbVersion: STUDY_DB_VERSION,
    exportedAt: now,
    data: {
      reviewItems: [
        {
          id: reviewItemId,
          vocabularyId: "fr:bonjour-francais:v1",
          skill: "recognition",
          enabled: true,
          updatedAt: now,
          introducedAt: now - 60_000,
        },
      ],
      reviewStates: [
        {
          reviewItemId,
          due: now + 86_400_000,
          state: {
            kind: "fsrs",
            version: FSRS_PAYLOAD_VERSION,
            card: {
              due: now + 86_400_000,
              stability: 3,
              difficulty: 5,
              elapsedDays: 1,
              scheduledDays: 1,
              learningSteps: 0,
              reps: 2,
              lapses: 0,
              state: State.Review,
              lastReview: now,
            },
          },
          updatedAt: now,
        },
      ],
      reviewEvents: [
        {
          id: "event-1",
          reviewItemId,
          reviewedAt: now,
          rating: "good",
          mode: "recall",
          createdAt: now,
        },
      ],
      progress: [],
      settings: [],
      dailyStudyPlans: [],
    },
  };
}

test("accepts a structurally and semantically valid backup", () => {
  const backup = makeValidBackup();
  assert.deepEqual(parseStudyBackup(backup), backup);
});

test("rejects a backup from a newer database version", () => {
  const backup = makeValidBackup();
  backup.dbVersion = STUDY_DB_VERSION + 1;

  assert.throws(
    () => parseStudyBackup(backup),
    /更新版本的学习数据库/
  );
});

test("rejects duplicate primary records", () => {
  const backup = makeValidBackup();
  backup.data.reviewItems.push({ ...backup.data.reviewItems[0] });

  assert.throws(
    () => parseStudyBackup(backup),
    /reviewItems 中存在重复记录/
  );
});

test("rejects review states whose FSRS payload does not match the stored due time", () => {
  const backup = makeValidBackup();
  backup.data.reviewStates[0].due += 1;

  assert.throws(
    () => parseStudyBackup(backup),
    /无效或不兼容的 FSRS 状态/
  );
});

test("rejects review states that reference a missing review item", () => {
  const backup = makeValidBackup();
  backup.data.reviewStates[0].reviewItemId = "missing-review-item";

  assert.throws(
    () => parseStudyBackup(backup),
    /reviewStates 引用了不存在的 reviewItem/
  );
});

test("rejects review events that reference a missing review item", () => {
  const backup = makeValidBackup();
  backup.data.reviewEvents[0].reviewItemId = "missing-review-item";

  assert.throws(
    () => parseStudyBackup(backup),
    /reviewEvents 引用了不存在的 reviewItem/
  );
});
