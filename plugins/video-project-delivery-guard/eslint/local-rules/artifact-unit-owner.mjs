const jsxName = (node) => node?.name?.name ?? node?.name;

export default {
  meta: { type: "problem", schema: [], messages: { owner: "A visual unit may not own audio, composition, global scheduling, I/O, network, or wall-clock randomness." } },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (["Audio", "Composition", "Sequence", "Series", "TransitionSeries"].includes(jsxName(node))) context.report({ node, messageId: "owner" });
      },
      CallExpression(node) {
        const name = node.callee?.name ?? node.callee?.property?.name;
        if (["fetch", "setTimeout", "setInterval", "random"].includes(name)) context.report({ node, messageId: "owner" });
      },
    };
  },
};
