import { digest } from "./workflow-state.mjs";
import { validateApplication, writeScopesOverlap } from "./workflow-policy.mjs";

function activeApplications(state) {
  return Object.values(state.applications).filter((application) =>
    application.runId === state.run?.id && !["delivered", "failed"].includes(application.state)
  );
}

function graphDigest(applications) {
  const graph = applications
    .map(({ id, role, reviewFor, dependencies, artifactPath }) => ({ id, role, reviewFor, dependencies, artifactPath }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return digest(JSON.stringify(graph));
}

export function stageApplication(state, raw, preserved = {}) {
  if (state.run?.phase !== "open") throw new Error("no governed run is open");
  if (state.run.sealedAt) throw new Error("application graph is sealed by final review");
  const application = { ...validateApplication(raw, state.run.id), ...preserved };
  if (state.applications[application.id]) throw new Error(`application already exists: ${application.id}`);
  const active = activeApplications(state);
  if (active.length >= 3) throw new Error("at most three active companion applications are allowed");
  for (const dependency of application.dependencies) {
    if (state.applications[dependency]?.state !== "delivered") throw new Error(`dependency is not delivered: ${dependency}`);
  }
  if (["spec-reviewer", "quality-reviewer"].includes(application.role)) {
    const reviewed = state.applications[application.reviewFor];
    if (!reviewed || reviewed.role !== "implementer" || reviewed.state !== "delivered") {
      throw new Error(`${application.role} requires reviewFor to reference a delivered implementer`);
    }
  }
  if (application.role === "final-reviewer") {
    const earlier = Object.values(state.applications);
    const unfinished = earlier.filter((item) => item.role !== "final-reviewer" && item.state !== "delivered");
    if (unfinished.length > 0) throw new Error("final review requires all earlier applications to be delivered");
    state.run.sealedAt = Date.now();
    state.run.sealedApplicationIds = earlier.map((item) => item.id).sort();
    state.run.sealedGraphDigest = graphDigest(earlier);
    application.graphDigest = state.run.sealedGraphDigest;
  }
  for (const other of active) {
    if (writeScopesOverlap(application.writeScope, other.writeScope)) {
      throw new Error(`write scope overlaps active application ${other.id}`);
    }
  }
  const stored = { ...application, state: "prepared", reservedBy: null, agentId: null, resultStatus: null, artifactPath: null };
  state.applications[stored.id] = stored;
  return stored;
}

function deliveredFor(state, role, reviewFor = null) {
  return Object.values(state.applications).some((application) =>
    application.role === role && application.reviewFor === reviewFor && application.state === "delivered" &&
    ["DONE", "DONE_WITH_CONCERNS"].includes(application.resultStatus)
  );
}

export function validateRunClosure(state, completion) {
  if (state.run?.phase !== "open") throw new Error("no governed run is open");
  if (!["DONE", "DONE_WITH_CONCERNS", "NEEDS_CONTEXT", "BLOCKED"].includes(completion)) {
    throw new Error("--status must be DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED");
  }
  if (!["DONE", "DONE_WITH_CONCERNS"].includes(completion)) return;
  const applications = Object.values(state.applications);
  if (applications.length === 0) throw new Error("cannot close an empty governed run");
  if (!applications.some((application) => application.role === "implementer")) {
    throw new Error("a completed governed run requires at least one implementer");
  }
  const incomplete = applications.filter((application) => application.state !== "delivered");
  if (incomplete.length > 0) throw new Error(`applications are not delivered: ${incomplete.map((item) => item.id).join(", ")}`);
  const nonPassing = applications.filter((application) => !["DONE", "DONE_WITH_CONCERNS"].includes(application.resultStatus));
  if (nonPassing.length > 0) throw new Error(`applications have non-passing results: ${nonPassing.map((item) => `${item.id}:${item.resultStatus}`).join(", ")}`);
  for (const implementer of applications.filter((application) => application.role === "implementer")) {
    if (!deliveredFor(state, "spec-reviewer", implementer.id)) throw new Error(`missing delivered spec review for ${implementer.id}`);
    if (!deliveredFor(state, "quality-reviewer", implementer.id)) throw new Error(`missing delivered quality review for ${implementer.id}`);
  }
  const finalReview = applications.find((application) =>
    application.role === "final-reviewer" && application.reviewFor === null && application.state === "delivered" &&
    ["DONE", "DONE_WITH_CONCERNS"].includes(application.resultStatus)
  );
  if (!finalReview) throw new Error("missing delivered final review");
  const reviewed = applications.filter((application) => application.role !== "final-reviewer");
  const currentIds = reviewed.map((item) => item.id).sort();
  if (!state.run.sealedAt || JSON.stringify(currentIds) !== JSON.stringify(state.run.sealedApplicationIds) ||
      graphDigest(reviewed) !== state.run.sealedGraphDigest || finalReview.graphDigest !== state.run.sealedGraphDigest) {
    throw new Error("final review is stale because the sealed application graph changed");
  }
}

export function closeRun(state, completion) {
  validateRunClosure(state, completion);
  state.run.phase = "closed";
  state.run.closedAt = Date.now();
  state.run.completion = completion;
  return state.run.id;
}
