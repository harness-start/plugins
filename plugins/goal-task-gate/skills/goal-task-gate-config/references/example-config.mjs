// Project overrides for goal-task-gate. Unspecified fields use plugin defaults.
export default {
  tipWindow: 3,
  minRows: 2,
  sessionTtlHours: 48,
  softOnly: false,
  stopGate: {
    mode: "block",
    softSparseWhileArmed: true,
  },
  gitignoreEnsure: true,
};
