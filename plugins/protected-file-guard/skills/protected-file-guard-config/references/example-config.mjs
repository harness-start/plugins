// User rules run before protected-file-guard built-ins; first match wins.
export default {
  rules: [
    {
      id: "protect-generated-sdk",
      match: /^src\/generated-sdk\//,
      mode: "block",
      reason: "The SDK is maintained by a generator",
      recovery: "Change the generator source and regenerate the SDK",
    },
    {
      id: "allow-reviewed-vendor-patch",
      match: /^vendor\/acme\/patched\//,
      mode: "allow",
    },
  ],
};
