#!/bin/sh
# Converts ZAP's JSON report to SARIF 2.1.0 for GitHub code scanning. Usage: sarif.sh report.json rules.tsv out.sarif
# ZAP scans a running service, not source files, so every result is located at the service URL and GitHub shows it on the
# repository's Security tab (not as a line in the diff). Rules marked FAIL in rules.tsv are "error", the rest "warning" or "note".
set -eu
report=$1 rules=$2 out=$3
fail_ids=$(awk -F'\t' '!/^#/ && $2=="FAIL" {printf "%s ", $1}' "$rules")

jq --arg fail " $fail_ids" '
  def level: .pluginid as $id | if ($fail | contains(" " + $id + " ")) then "error"
             elif (.riskcode | tonumber) >= 1 then "warning" else "note" end;
  [.site[]?.alerts[]?] as $alerts
  | {
    "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{
      tool: {driver: {
        name: "OWASP ZAP", informationUri: "https://www.zaproxy.org/",
        rules: [$alerts[] | {
          id: .pluginid, name: .alert,
          shortDescription: {text: .alert},
          helpUri: ("https://www.zaproxy.org/docs/alerts/" + .pluginid + "/"),
          defaultConfiguration: {level: level}
        }]
      }},
      results: [$alerts[] | . as $a | $a.instances[]? | {
        ruleId: $a.pluginid, level: ($a | level),
        message: {text: ($a.alert + " (" + $a.riskdesc + "): " + (.method // "GET") + " " + .uri)},
        locations: [{physicalLocation: {artifactLocation: {uri: "backend/"}}}],
        partialFingerprints: {zap: ($a.pluginid + " " + (.method // "GET") + " " + (.uri | sub("^https?://[^/]+"; "")))}
      }]
    }]
  }' "$report" > "$out"
