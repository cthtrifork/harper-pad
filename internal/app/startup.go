package app

import "github.com/cthtrifork/harper-pad/internal/store"

// StartupState is what the page needs before it can show the editor, in one answer. Each call from the page to the Go side is a
// round trip (Lighthouse prices each at about a second on its simulated slow network), so the page asks once. It reads one draft
// and counts the rest: the list itself is fetched when the drawer opens, because listing reads every draft it shows.
type StartupState struct {
	// Demo is the banner text in demo mode (development builds only), and empty otherwise; see DemoMode.
	Demo string `json:"demo"`
	// Open is the most recent draft, with its text, or nil when there are no drafts.
	Open *store.Draft `json:"open"`
	// Total is how many drafts there are.
	Total int `json:"total"`
	// Error says why the drafts could not be read (for example a database from a newer version), and is empty otherwise. The
	// page still starts, with nothing saved.
	Error string `json:"error"`
}

// Startup returns what the page needs to start: the demo banner, the most recent draft and the number of drafts.
func (s *PadService) Startup() StartupState {
	out := StartupState{Demo: demoDetail()}
	newest, err := s.ListDrafts(1, 0) // one summary and the count
	if err != nil {
		out.Error = err.Error()
		return out
	}
	out.Total = newest.Total
	if len(newest.Drafts) == 0 {
		return out
	}
	d, err := s.GetDraft(newest.Drafts[0].ID)
	if err != nil {
		out.Error = err.Error()
		return out
	}
	out.Open = &d
	return out
}
