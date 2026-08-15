export default {
  meta: { type: "problem", schema: [], messages: { owner: "A poster layer may not own stacking, rendering, I/O, network, or runtime hooks.", export: "A poster layer must export exactly one buildLayer function." } },
  create(context) {
    let exports = 0;
    return {
      ExportNamedDeclaration(node) {
        if (node.declaration?.type === "FunctionDeclaration" && node.declaration.id?.name === "buildLayer") exports += 1;
      },
      Property(node) { if ((node.key?.name ?? node.key?.value) === "zIndex") context.report({ node, messageId: "owner" }); },
      CallExpression(node) {
        const name = node.callee?.name ?? node.callee?.property?.name;
        if (["fetch", "setTimeout", "setInterval", "useState", "useEffect", "useLayoutEffect"].includes(name)) context.report({ node, messageId: "owner" });
      },
      "Program:exit"(node) { if (exports !== 1) context.report({ node, messageId: "export" }); },
    };
  },
};
