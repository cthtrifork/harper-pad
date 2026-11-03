{{- /* One line per finding: the file Trivy found it in, a tab, then a Markdown list item. The workflow sorts, diffs and groups by file. */ -}}
{{- range . }}{{ $target := .Target }}{{ range .Vulnerabilities -}}
{{ $target }}	- {{ .Severity }} [{{ .VulnerabilityID }}](https://avd.aquasec.com/nvd/{{ .VulnerabilityID | lower }}) `{{ .PkgName }}` {{ .InstalledVersion }}
{{ end }}{{ end -}}
