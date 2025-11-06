const customMedia = require("postcss-custom-media");

const fixPolarisPrintMedia = () => ({
  postcssPlugin: "fix-polaris-print-media",
  AtRule(atRule) {
    if (
      atRule.name === "media" &&
      atRule.params.includes("--p-breakpoints") &&
      atRule.params.includes("and print")
    ) {
      atRule.params = atRule.params.replace("and print", "and (print)");
    }
  },
});
fixPolarisPrintMedia.postcss = true;

module.exports = {
  plugins: [customMedia(), fixPolarisPrintMedia()],
};
