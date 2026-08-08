// Pure step-list builder for the speaking exam. Extracted ahead of the
// multi-part (B1/A2) oral flow: SpeakingExam's phase machine will become a
// cursor over this list. For B2's single-part shape the output must mirror
// today's machine exactly: prep → monologue → followup×N.

export type OralTimings = {
  prepDefaultSec: number;
  prepPracticeSec: number;
  monologueMaxSec: number;
  followUpMaxSec: number;
};

export type OralStep =
  | { kind: 'prep'; seconds: number }
  | { kind: 'monologue'; maxSeconds: number }
  | { kind: 'followup'; followUpIdx: number; maxSeconds: number };

export function buildOralSteps(
  timings: OralTimings,
  followUpCount: number,
  mode: 'PRACTICE' | 'EXAM',
): OralStep[] {
  // EXAM gets the official prep time; PRACTICE the shortened one.
  const prepSeconds = mode === 'EXAM' ? timings.prepDefaultSec : timings.prepPracticeSec;
  const steps: OralStep[] = [
    { kind: 'prep', seconds: prepSeconds },
    { kind: 'monologue', maxSeconds: timings.monologueMaxSec },
  ];
  for (let i = 0; i < followUpCount; i++) {
    steps.push({ kind: 'followup', followUpIdx: i, maxSeconds: timings.followUpMaxSec });
  }
  return steps;
}
