package nginx

import (
	"os"
)

// EnsureStubStatus cleans up any legacy standalone nubi-status config
// The stub_status endpoint is now included in the default route config
func EnsureStubStatus() error {
	configPath := "/etc/nginx/sites-available/nubi-status"
	symlinkPath := "/etc/nginx/sites-enabled/nubi-status"

	// Remove legacy standalone status config if it exists
	// stub_status is now part of the default route template
	_ = os.Remove(symlinkPath)
	_ = os.Remove(configPath)

	return nil
}
