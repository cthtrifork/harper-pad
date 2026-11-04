package admin

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"strconv"
	"sync"
	"time"
)

// stubStore is the Store of a binary that has no database code yet: every call fails with ErrNotImplemented, so the pages
// show "not built yet" instead of invented data.
type stubStore struct{}

// NewStubStore returns a Store whose every method returns ErrNotImplemented.
func NewStubStore() Store { return stubStore{} }

func (stubStore) Accounts(context.Context) ([]Account, error) { return nil, ErrNotImplemented }
func (stubStore) Devices(context.Context) ([]Device, error)   { return nil, ErrNotImplemented }
func (stubStore) RenameDevice(context.Context, string, string) (Device, error) {
	return Device{}, ErrNotImplemented
}
func (stubStore) RevokeDevice(context.Context, string) error { return ErrNotImplemented }
func (stubStore) PendingInvites(context.Context, time.Time) ([]Invite, error) {
	return nil, ErrNotImplemented
}
func (stubStore) CreateInvite(context.Context, string, time.Duration) (string, Invite, error) {
	return "", Invite{}, ErrNotImplemented
}
func (stubStore) CancelInvite(context.Context, string) error { return ErrNotImplemented }

// demoStore keeps the data in memory and starts with three devices. It is for looking at and
// testing the UI (ADMIN_DEMO=true), never for a deployment: nothing is persisted and nothing enrolls.
type demoStore struct {
	mu      sync.Mutex
	now     func() time.Time
	devices []Device
	invites []Invite
	nextID  int
}

// NewDemoStore returns a seeded in-memory Store. now is the clock (time.Now when nil).
func NewDemoStore(now func() time.Time) Store {
	if now == nil {
		now = time.Now
	}
	t := now()
	return &demoStore{now: now, nextID: 4, devices: []Device{
		{ID: "d1", Name: "Desktop", UserAgent: "Harper Pad 0.9 · Linux", CreatedAt: t.AddDate(0, 0, -23), LastSeen: t.Add(-2 * time.Minute)},
		{ID: "d2", Name: "iPhone", UserAgent: "Safari · Home Screen app", CreatedAt: t.AddDate(0, 0, -7), LastSeen: t.Add(-27 * time.Hour)},
		{ID: "d3", Name: "Old laptop", UserAgent: "Chromium · Windows", CreatedAt: t.AddDate(0, 0, -62), LastSeen: t.AddDate(0, 0, -37)},
	}}
}

func (s *demoStore) Accounts(context.Context) ([]Account, error) {
	return []Account{{ID: 1, Name: "default"}}, nil
}

func (s *demoStore) Devices(context.Context) ([]Device, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Device(nil), s.devices...), nil
}

func (s *demoStore) RenameDevice(_ context.Context, id, name string) (Device, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.devices {
		if s.devices[i].ID == id {
			s.devices[i].Name = name
			return s.devices[i], nil
		}
	}
	return Device{}, ErrNotFound
}

func (s *demoStore) RevokeDevice(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.devices {
		if s.devices[i].ID == id {
			s.devices = append(s.devices[:i], s.devices[i+1:]...)
			return nil
		}
	}
	return ErrNotFound
}

func (s *demoStore) PendingInvites(_ context.Context, now time.Time) ([]Invite, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []Invite
	for _, inv := range s.invites {
		if inv.ExpiresAt.After(now) {
			out = append(out, inv)
		}
	}
	return out, nil
}

func (s *demoStore) CreateInvite(_ context.Context, deviceName string, ttl time.Duration) (string, Invite, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", Invite{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	inv := Invite{ID: "i" + strconv.Itoa(s.nextID), DeviceName: deviceName, ExpiresAt: s.now().Add(ttl)}
	s.nextID++
	s.invites = append(s.invites, inv)
	return base64.RawURLEncoding.EncodeToString(raw), inv, nil
}

func (s *demoStore) CancelInvite(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.invites {
		if s.invites[i].ID == id {
			s.invites = append(s.invites[:i], s.invites[i+1:]...)
			return nil
		}
	}
	return ErrNotFound
}
