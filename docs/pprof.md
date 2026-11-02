# Profiling (pprof)

Go's `net/http/pprof` endpoint, for finding CPU and allocation hot spots in a **running** app. It is a development aid. This repo never ships it.

## Turning it on

Compiled in only with the `pprof` build tag; it starts when the process starts.

```sh
make run-pprof-server          # headless: CGO_ENABLED=0 go run -tags server,pprof .
go run -tags pprof .           # desktop build (needs GTK4 + WebKitGTK 6)
```

The log prints `pprof endpoint started url=http://127.0.0.1:6060/debug/pprof/`. Set `HARPER_PAD_PPROF_ADDR` for another loopback address or port (`127.0.0.1:0` picks a free port).

## Using it

Start a CPU profile, then do the flow you want to measure (typing in the editor, opening the drawer). Only one CPU profile can run at a time, and the capture always lasts the full `seconds`:

```sh
curl -s 'localhost:6060/debug/pprof/profile?seconds=60' -o cpu.pprof &
# ...click through the flow...
go tool pprof -top -cum -nodecount=25 cpu.pprof
curl -s localhost:6060/debug/pprof/allocs -o allocs.pprof
go tool pprof -sample_index=alloc_space -top allocs.pprof
```

## Security

Anyone who can reach the port can read goroutine stacks, heap contents and the command line, and can make the process burn CPU.

- Binds to loopback only. A non-loopback `HARPER_PAD_PPROF_ADDR` aborts start-up.
- **Never in releases.** `internal/app/pprof_guard.go` makes `-tags pprof,production` fail to compile, and CI greps the production binary for the start-up message (`Production build contains no pprof endpoint`).
