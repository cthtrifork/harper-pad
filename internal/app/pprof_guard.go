//go:build pprof && production

package app

// The pprof endpoint exposes goroutine stacks, heap contents and command line without
// authentication (docs/pprof.md). It is for development only, so a build with both tags must
// not compile; the undefined name below is the error message.
var _ = the_pprof_build_tag_must_not_be_combined_with_the_production_tag
