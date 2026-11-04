// Package protocol holds the request and response types of the sync API and the limits the server enforces on a draft
// (size, id pattern, formats). The limits are written here separately from the app's internal/store on purpose; the
// end-to-end test is what keeps the two in step. In v2 it also checks the shape of the encrypted envelope.
package protocol
