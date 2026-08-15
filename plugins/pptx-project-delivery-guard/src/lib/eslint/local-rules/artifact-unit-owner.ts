const nameOf = (callee) => callee?.type === "Identifier" ? callee.name : callee?.property?.name;

export default {
  meta: { type: "problem", schema: [], messages: { owner: "A slide module may only export renderSlide and may not create decks, slides, files, or network effects.", export: "A slide module must export exactly one renderSlide function." } },
  create(context) {
    let exports = 0;
    return {
      ExportNamedDeclaration(node) {
        if (node.declaration?.type === "FunctionDeclaration" && node.declaration.id?.name === "renderSlide") exports += 1;
      },
      CallExpression(node) {
        if (["addSlide", "writeFile", "writeFileSync", "createWriteStream", "fetch", "setTimeout", "setInterval"].includes(nameOf(node.callee))) context.report({ node, messageId: "owner" });
      },
      NewExpression(node) {
        if (["pptxgen", "PptxGenJS"].includes(nameOf(node.callee))) context.report({ node, messageId: "owner" });
      },
      "Program:exit"(node) { if (exports !== 1) context.report({ node, messageId: "export" }); },
    };
  },
};
