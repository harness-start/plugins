const jsxName = (node) => node?.name?.name ?? node?.name;
const FORBIDDEN_REMOTION_IMPORTS = new Set(["Audio", "Composition", "Sequence", "Series", "TransitionSeries"]);

function report(context, node) {
  context.report({ node, messageId: "owner" });
}

export default {
  meta: { type: "problem", schema: [], messages: { owner: "A visual unit may not own audio, composition, global scheduling, I/O, network, or wall-clock randomness." } },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source?.value;
        if (source === "@remotion/renderer" || /^node:(?:fs|child_process)$/u.test(source ?? "")) report(context, node);
        if (source === "remotion" && node.specifiers?.some((specifier) => specifier.type === "ImportNamespaceSpecifier" || FORBIDDEN_REMOTION_IMPORTS.has(specifier.imported?.name))) report(context, node);
      },
      ImportExpression(node) {
        if (["@remotion/renderer", "node:fs", "node:child_process"].includes(node.source?.value)) report(context, node);
      },
      JSXOpeningElement(node) {
        if (FORBIDDEN_REMOTION_IMPORTS.has(jsxName(node))) report(context, node);
      },
      CallExpression(node) {
        const name = node.callee?.name ?? node.callee?.property?.name;
        if (["fetch", "setTimeout", "setInterval", "random"].includes(name)) report(context, node);
      },
      NewExpression(node) {
        if (["XMLHttpRequest", "WebSocket"].includes(node.callee?.name)) report(context, node);
      },
    };
  },
};
