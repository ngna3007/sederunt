/**
 * The stamp is a checkpoint sequence. A checkpoint later than the checkpoint
 * at which the result was already knowable is refused.
 *
 * @param {{ checkpoint: number, knowableAtCheckpoint: number }} input
 */
export function acceptCheckpoint(input) {
  const { checkpoint, knowableAtCheckpoint } = input;
  if (!Number.isInteger(checkpoint) || checkpoint < 0) {
    return { ok: false, reason: "invalid-checkpoint" };
  }
  if (!Number.isInteger(knowableAtCheckpoint) || knowableAtCheckpoint < 0) {
    return { ok: false, reason: "invalid-knowable-at" };
  }
  if (checkpoint > knowableAtCheckpoint) {
    return { ok: false, reason: "late" };
  }
  return { ok: true, stamp: checkpoint };
}
