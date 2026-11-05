package syncapi

import (
	"net/http"
	"strings"
)

// Huma's own documentation page is Stoplight Elements with layout="sidebar", a fixed sidebar that fills a phone screen and
// leaves no room for the content. Huma has no setting for the layout, so the page is served here, the same as Huma's with
// layout="responsive" (the sidebar collapses behind a menu on a narrow screen). The versions and integrity hashes are the
// ones of the Huma release in go.mod (api.go, registerDocsRoute); update them together when Huma is upgraded.
const (
	elementsVersion = "9.0.29"
	elementsCSSHash = "sha384-iVQBHadsD+eV0M5+ubRCEVXrXEBj+BqcuwjUwPoVJc0Pb1fmrhYSAhL+BFProHdV"
	elementsJSHash  = "sha384-enyjBaVmV00WFIo0D7AIVgtZ/4x0idVNWHotG8WUpvQo9HXgMSGAAW2YEOpiJTpP"
	elementsBase    = "https://unpkg.com/@stoplight/elements@" + elementsVersion
)

// docsPageCSP is Huma's policy for this page: nothing but the two pinned files from unpkg.com, no framing, no forms.
var docsPageCSP = strings.Join([]string{
	"default-src 'none'",
	"base-uri 'none'",
	"connect-src 'self'",
	"form-action 'none'",
	"frame-ancestors 'none'",
	"sandbox allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads",
	"script-src " + elementsBase + "/web-components.min.js",
	"style-src 'unsafe-inline' " + elementsBase + "/styles.min.css",
}, "; ")

const docsPageHTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="referrer" content="no-referrer">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Harper Pad sync API Reference</title>
    <link rel="stylesheet" href="` + elementsBase + `/styles.min.css" crossorigin integrity="` + elementsCSSHash + `">
    <script src="` + elementsBase + `/web-components.min.js" crossorigin integrity="` + elementsJSHash + `"></script>
  </head>
  <body style="height: 100vh;">
    <elements-api
      apiDescriptionUrl="/openapi.yaml"
      router="hash"
      layout="responsive"
      tryItCredentialsPolicy="same-origin"
    ></elements-api>
  </body>
</html>`

// docsPage serves the documentation page. It is public, like the OpenAPI document it reads.
func docsPage(w http.ResponseWriter, _ *http.Request) {
	h := w.Header()
	h.Set("Content-Type", "text/html; charset=utf-8")
	h.Set("Content-Security-Policy", docsPageCSP)
	_, _ = w.Write([]byte(docsPageHTML))
}
