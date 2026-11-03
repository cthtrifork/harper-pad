// Package store reads and writes the app's small JSON files (settings, later drafts) in the user's directories.
//
// Writes are atomic: the data goes to a temporary file in the same folder and is renamed over the target, so a crash or
// power cut leaves either the old file or the new one, never half of one. A file that cannot be parsed is moved aside
// as <name>.bad and treated as missing, so a damaged file never stops the app from starting.
package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// Save writes v as indented JSON to path, creating the folder (private to the user) if needed.
func Save(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, filepath.Base(path)+".tmp-*") // created with mode 0600
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name()) // a no-op once the rename has moved it
	if _, err := tmp.Write(append(data, '\n')); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

// Load reads the JSON file at path into v. A missing file leaves v as it is. A file that is not valid JSON for v is
// moved to path+".bad" (replacing an older one), v is left as it is, and recovered is true.
func Load(path string, v any) (recovered bool, err error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	// Decode into a copy first, so a half-matching file cannot leave v partly filled.
	if err := json.Unmarshal(data, v); err != nil {
		if mvErr := os.Rename(path, path+".bad"); mvErr != nil {
			return true, fmt.Errorf("%s is not valid (%v) and could not be moved aside: %w", path, err, mvErr)
		}
		return true, nil
	}
	return false, nil
}
