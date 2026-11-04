package admin

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"strconv"
	"sync"
	"time"
)

// fakeStore keeps the data in memory and starts with three devices, so the handler tests need no database. The SQL is tested
// against PostgreSQL in internal/store.
type fakeStore struct {
	mu      sync.Mutex
	now     func() time.Time
	devices []Device
	invites []Invite
	nextID  int
}

// newFakeStore returns a seeded in-memory Store. now is the clock (time.Now when nil).
func newFakeStore(now func() time.Time) Store {
	if now == nil {
		now = time.Now
	}
	t := now()
	return &fakeStore{now: now, nextID: 4, devices: []Device{
		{ID: "d1", Name: "Desktop", UserAgent: "Harper Pad 0.9 · Linux", CreatedAt: t.AddDate(0, 0, -23), LastSeen: t.Add(-2 * time.Minute)},
		{ID: "d2", Name: "iPhone", UserAgent: "Safari · Home Screen app", CreatedAt: t.AddDate(0, 0, -7), LastSeen: t.Add(-27 * time.Hour)},
		{ID: "d3", Name: "Old laptop", UserAgent: "Chromium · Windows", CreatedAt: t.AddDate(0, 0, -62), LastSeen: t.AddDate(0, 0, -37)},
	}}
}

func (s *fakeStore) Accounts(context.Context) ([]Account, error) {
	return []Account{{ID: 1, Name: "default"}}, nil
}

func (s *fakeStore) Devices(context.Context) ([]Device, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Device(nil), s.devices...), nil
}

func (s *fakeStore) RenameDevice(_ context.Context, id, name string) (Device, error) {
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

func (s *fakeStore) RevokeDevice(_ context.Context, id string) error {
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

func (s *fakeStore) PendingInvites(_ context.Context, now time.Time) ([]Invite, error) {
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

func (s *fakeStore) CreateInvite(_ context.Context, deviceName string, ttl time.Duration) (string, Invite, error) {
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

func (s *fakeStore) CancelInvite(_ context.Context, id string) error {
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
