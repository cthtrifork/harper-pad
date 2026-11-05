#!/bin/sh
# Turns ZAP's JSON report into GitHub output: annotations on stdout and a markdown summary in the file given as $3. Rules marked
# IGNORE in rules.tsv are left out. An alert whose rule is FAIL becomes an ::error, any other alert a ::warning.
# Usage: report.sh report.json rules.tsv summary.md
set -eu
report=$1 rules=$2 out=$3

ignore_ids=$(awk -F'\t' '!/^#/ && $2=="IGNORE" {printf "%s ", $1}' "$rules")
fail_ids=$(awk -F'\t' '!/^#/ && $2=="FAIL" {printf "%s ", $1}' "$rules")

alerts=$(jq -r --arg ignore " $ignore_ids" '[.site[]?.alerts[]?] | .[] | .pluginid as $id | select($ignore | contains(" " + $id + " ") | not) | [.pluginid, .alert, .riskdesc, .count] | @tsv' "$report")

{
  echo "### OWASP ZAP scan of the sync backend"
  echo
  if [ -z "$alerts" ]; then
    echo "No alerts."
  else
    echo "| Rule | Alert | Risk | Count | Fails the job |"
    echo "|---|---|---|---|---|"
  fi
} > "$out"

[ -z "$alerts" ] && exit 0

printf '%s\n' "$alerts" | while IFS="$(printf '\t')" read -r id name risk count; do
  case " $fail_ids" in *" $id "*) fails=yes; level=error ;; *) fails=no; level=warning ;; esac
  echo "| [$id](https://www.zaproxy.org/docs/alerts/$id/) | $name | $risk | $count | $fails |" >> "$out"
  echo "::$level title=ZAP $id::$name ($risk, $count instances). See the zap-report artifact."
done
