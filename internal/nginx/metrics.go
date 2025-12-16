package nginx

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Metrics holds nginx performance metrics from stub_status
type Metrics struct {
	ActiveConnections int64  `json:"activeConnections"`
	Accepts           int64  `json:"accepts"`
	Handled           int64  `json:"handled"`
	Requests          int64  `json:"requests"`
	Reading           int64  `json:"reading"`
	Writing           int64  `json:"writing"`
	Waiting           int64  `json:"waiting"`
	Uptime            int64  `json:"uptime"`      // seconds
	UptimeString      string `json:"uptimeString"` // human readable
}

// SystemMetrics holds system-level network metrics
type SystemMetrics struct {
	RxBytes   int64 `json:"rxBytes"`
	TxBytes   int64 `json:"txBytes"`
	RxPackets int64 `json:"rxPackets"`
	TxPackets int64 `json:"txPackets"`
}

// GetMetrics fetches metrics from nginx stub_status endpoint
func GetMetrics(stubStatusURL string) (*Metrics, error) {
	if stubStatusURL == "" {
		// Use the main proxy server's status endpoint (port 80)
		// This tracks actual reverse proxy connections, not management page
		stubStatusURL = "http://127.0.0.1:80/.nubi/status"
	}

	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(stubStatusURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch stub_status: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	metrics, err := parseStubStatus(string(body))
	if err != nil {
		return nil, err
	}

	// Subtract 1 from active connections to exclude this metrics request itself
	if metrics.ActiveConnections > 0 {
		metrics.ActiveConnections--
	}
	// Also adjust writing count (this request is in "writing" state)
	if metrics.Writing > 0 {
		metrics.Writing--
	}

	return metrics, nil
}

// parseStubStatus parses nginx stub_status output
// Example output:
// Active connections: 1
// server accepts handled requests
//  16 16 18
// Reading: 0 Writing: 1 Waiting: 0
func parseStubStatus(data string) (*Metrics, error) {
	metrics := &Metrics{}
	lines := strings.Split(data, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Active connections: N
		if strings.HasPrefix(line, "Active connections:") {
			parts := strings.Split(line, ":")
			if len(parts) == 2 {
				metrics.ActiveConnections, _ = strconv.ParseInt(strings.TrimSpace(parts[1]), 10, 64)
			}
		}

		// N N N (accepts handled requests)
		if match := regexp.MustCompile(`^\s*(\d+)\s+(\d+)\s+(\d+)\s*$`).FindStringSubmatch(line); match != nil {
			metrics.Accepts, _ = strconv.ParseInt(match[1], 10, 64)
			metrics.Handled, _ = strconv.ParseInt(match[2], 10, 64)
			metrics.Requests, _ = strconv.ParseInt(match[3], 10, 64)
		}

		// Reading: N Writing: N Waiting: N
		if strings.HasPrefix(line, "Reading:") {
			re := regexp.MustCompile(`Reading:\s*(\d+)\s+Writing:\s*(\d+)\s+Waiting:\s*(\d+)`)
			if match := re.FindStringSubmatch(line); match != nil {
				metrics.Reading, _ = strconv.ParseInt(match[1], 10, 64)
				metrics.Writing, _ = strconv.ParseInt(match[2], 10, 64)
				metrics.Waiting, _ = strconv.ParseInt(match[3], 10, 64)
			}
		}
	}

	// Get nginx uptime from process
	metrics.Uptime, metrics.UptimeString = getNginxUptime()

	return metrics, nil
}

// getNginxUptime gets nginx master process uptime
func getNginxUptime() (int64, string) {
	// Try to read nginx master process start time
	// On Linux, we can check /proc/<pid>/stat
	pidFile := "/run/nginx.pid"
	pidData, err := os.ReadFile(pidFile)
	if err != nil {
		return 0, "unknown"
	}

	pid := strings.TrimSpace(string(pidData))
	statFile := fmt.Sprintf("/proc/%s/stat", pid)
	statData, err := os.ReadFile(statFile)
	if err != nil {
		return 0, "unknown"
	}

	// Parse start time (field 22 in /proc/pid/stat)
	fields := strings.Fields(string(statData))
	if len(fields) < 22 {
		return 0, "unknown"
	}

	startTimeTicks, err := strconv.ParseInt(fields[21], 10, 64)
	if err != nil {
		return 0, "unknown"
	}

	// Get system boot time and clock ticks
	uptime := getSystemUptime()
	clockTicks := int64(100) // Usually 100 on Linux

	// Calculate process uptime
	processStartSec := startTimeTicks / clockTicks
	processUptime := uptime - processStartSec

	if processUptime < 0 {
		processUptime = 0
	}

	return processUptime, formatUptime(processUptime)
}

// getSystemUptime returns system uptime in seconds
func getSystemUptime() int64 {
	data, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0
	}

	fields := strings.Fields(string(data))
	if len(fields) < 1 {
		return 0
	}

	uptime, _ := strconv.ParseFloat(fields[0], 64)
	return int64(uptime)
}

// formatUptime formats seconds into human readable string
func formatUptime(seconds int64) string {
	days := seconds / 86400
	hours := (seconds % 86400) / 3600
	minutes := (seconds % 3600) / 60

	if days > 0 {
		return fmt.Sprintf("%dd %dh %dm", days, hours, minutes)
	}
	if hours > 0 {
		return fmt.Sprintf("%dh %dm", hours, minutes)
	}
	return fmt.Sprintf("%dm", minutes)
}

// GetNetworkMetrics reads network interface stats
func GetNetworkMetrics(iface string) (*SystemMetrics, error) {
	if iface == "" {
		iface = "eth0"
	}

	file, err := os.Open("/proc/net/dev")
	if err != nil {
		return nil, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, iface+":") {
			fields := strings.Fields(line)
			if len(fields) < 17 {
				continue
			}

			// Remove interface name prefix
			for i, f := range fields {
				if strings.HasSuffix(f, ":") {
					fields = fields[i+1:]
					break
				}
				if strings.Contains(f, ":") {
					parts := strings.Split(f, ":")
					fields[i] = parts[1]
					break
				}
			}

			if len(fields) < 10 {
				return nil, fmt.Errorf("unexpected format")
			}

			rxBytes, _ := strconv.ParseInt(fields[0], 10, 64)
			rxPackets, _ := strconv.ParseInt(fields[1], 10, 64)
			txBytes, _ := strconv.ParseInt(fields[8], 10, 64)
			txPackets, _ := strconv.ParseInt(fields[9], 10, 64)

			return &SystemMetrics{
				RxBytes:   rxBytes,
				TxBytes:   txBytes,
				RxPackets: rxPackets,
				TxPackets: txPackets,
			}, nil
		}
	}

	return nil, fmt.Errorf("interface %s not found", iface)
}

// FormatBytes formats bytes into human readable string
func FormatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}
