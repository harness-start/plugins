export default {
  meta: { type: "problem", schema: [], messages: { static: "Publication units must be static React without client runtime, I/O, network, or nondeterminism.", export: "A publication unit must export exactly one component." } },
  create(context) {
    let exports = 0;
    return {
      ExportNamedDeclaration(node) { if (node.declaration?.type === "FunctionDeclaration") exports += 1; },
      CallExpression(node) {
        const name = node.callee?.name ?? node.callee?.property?.name;
        if (["useState", "useEffect", "useLayoutEffect", "useReducer", "hydrateRoot", "createRoot", "createPortal", "fetch", "setTimeout", "setInterval", "random"].includes(name)) context.report({ node, messageId: "static" });
      },
      "Program:exit"(node) { if (exports !== 1) context.report({ node, messageId: "export" }); },
    };
  },
};
