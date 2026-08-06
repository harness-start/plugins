// User rules run before protected-file-guard built-ins; first match wins.
export default {
  rules: [
    {
      id: "protect-generated-sdk",
      match: /^src\/generated-sdk\//,
      mode: "block",
      reason: "SDK 由生成器维护",
      recovery: "修改生成源并重新生成 SDK",
    },
    {
      id: "allow-reviewed-vendor-patch",
      match: /^vendor\/acme\/patched\//,
      mode: "allow",
    },
  ],
};
