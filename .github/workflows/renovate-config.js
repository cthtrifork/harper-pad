// Renovate's global (self-hosted) options for the Actions run (renovate.yml): the scheduled fallback and the
// pull-request dry run. The in-cluster Renovate (cthtrifork/talos-gitops, k8s/apps/renovate/renovatejob.yaml) has the same
// options in its own global config: keep the two in step. Everything else is repo config in .github/renovate.json5.
module.exports = {
  // The only command a post-upgrade task may run: the htmx vendoring script (packageRules in renovate.json5).
  allowedCommands: ['^scripts/update-htmx\\.sh [0-9]+\\.[0-9]+\\.[0-9]+$'],
};
