package api

import (
	"bufio"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// LogEntry represents a parsed nginx access log entry
type LogEntry struct {
	IP        string `json:"ip"`
	Time      string `json:"time"`
	Method    string `json:"method"`
	Path      string `json:"path"`
	Status    int    `json:"status"`
	Size      int64  `json:"size"`
	Referer   string `json:"referer"`
	UserAgent string `json:"userAgent"`
	Host      string `json:"host"`
}

// IPStats represents IP-based statistics
type IPStats struct {
	IP       string `json:"ip"`
	Requests int    `json:"requests"`
	Country  string `json:"country"`
}

// UAStats represents User-Agent statistics
type UAStats struct {
	UserAgent string `json:"userAgent"`
	Browser   string `json:"browser"`
	OS        string `json:"os"`
	Requests  int    `json:"requests"`
}

// CountryStats represents country-based statistics
type CountryStats struct {
	Country  string  `json:"country"`
	Code     string  `json:"code"`
	Requests int     `json:"requests"`
	Percent  float64 `json:"percent"`
}

// LogStatsResponse represents the log statistics response
type LogStatsResponse struct {
	TotalRequests int            `json:"totalRequests"`
	UniqueIPs     int            `json:"uniqueIPs"`
	TopIPs        []IPStats      `json:"topIPs"`
	TopUserAgents []UAStats      `json:"topUserAgents"`
	Countries     []CountryStats `json:"countries"`
	StatusCodes   map[int]int    `json:"statusCodes"`
	RecentLogs    []LogEntry     `json:"recentLogs"`
}

// Simple IP to country mapping (simplified - in production use MaxMind GeoIP)
var ipCountryMap = map[string]string{
	"127.":    "Local",
	"192.168": "Local",
	"10.":     "Local",
	"172.":    "Local",
}

func getCountryFromIP(ip string) (string, string) {
	// Check local IPs
	for prefix, country := range ipCountryMap {
		if strings.HasPrefix(ip, prefix) {
			return country, "LOCAL"
		}
	}
	
	// For demo purposes, return based on first octet
	// In production, use MaxMind GeoIP2 database
	parts := strings.Split(ip, ".")
	if len(parts) > 0 {
		firstOctet, _ := strconv.Atoi(parts[0])
		switch {
		case firstOctet >= 1 && firstOctet <= 50:
			return "United States", "US"
		case firstOctet >= 51 && firstOctet <= 80:
			return "Europe", "EU"
		case firstOctet >= 81 && firstOctet <= 120:
			return "Asia", "AS"
		case firstOctet >= 121 && firstOctet <= 150:
			return "South Korea", "KR"
		case firstOctet >= 151 && firstOctet <= 180:
			return "Japan", "JP"
		case firstOctet >= 181 && firstOctet <= 200:
			return "China", "CN"
		default:
			return "Other", "XX"
		}
	}
	return "Unknown", "XX"
}

func parseBrowserOS(ua string) (string, string) {
	ua = strings.ToLower(ua)
	
	// Browser detection
	browser := "Other"
	if strings.Contains(ua, "chrome") && !strings.Contains(ua, "edg") {
		browser = "Chrome"
	} else if strings.Contains(ua, "firefox") {
		browser = "Firefox"
	} else if strings.Contains(ua, "safari") && !strings.Contains(ua, "chrome") {
		browser = "Safari"
	} else if strings.Contains(ua, "edg") {
		browser = "Edge"
	} else if strings.Contains(ua, "msie") || strings.Contains(ua, "trident") {
		browser = "IE"
	} else if strings.Contains(ua, "bot") || strings.Contains(ua, "crawler") || strings.Contains(ua, "spider") {
		browser = "Bot"
	} else if strings.Contains(ua, "curl") {
		browser = "cURL"
	} else if strings.Contains(ua, "wget") {
		browser = "Wget"
	}
	
	// OS detection
	os := "Other"
	if strings.Contains(ua, "windows") {
		os = "Windows"
	} else if strings.Contains(ua, "mac os") || strings.Contains(ua, "macos") {
		os = "macOS"
	} else if strings.Contains(ua, "linux") {
		os = "Linux"
	} else if strings.Contains(ua, "android") {
		os = "Android"
	} else if strings.Contains(ua, "iphone") || strings.Contains(ua, "ipad") {
		os = "iOS"
	}
	
	return browser, os
}

// parseNginxLog parses nginx combined log format
// Example: 127.0.0.1 - - [10/Dec/2024:10:00:00 +0000] "GET /path HTTP/1.1" 200 1234 "http://referer" "Mozilla/5.0"
func parseNginxLog(line string) *LogEntry {
	// Regex for combined log format
	re := regexp.MustCompile(`^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) [^"]*" (\d+) (\d+) "([^"]*)" "([^"]*)"`)
	matches := re.FindStringSubmatch(line)
	
	if len(matches) < 9 {
		return nil
	}
	
	status, _ := strconv.Atoi(matches[5])
	size, _ := strconv.ParseInt(matches[6], 10, 64)
	
	return &LogEntry{
		IP:        matches[1],
		Time:      matches[2],
		Method:    matches[3],
		Path:      matches[4],
		Status:    status,
		Size:      size,
		Referer:   matches[7],
		UserAgent: matches[8],
	}
}

// handleGetLogStats returns log statistics
func (s *Server) handleGetLogStats(ctx *gin.Context) {
	logPath := "/var/log/nginx/access.log"
	
	// Check for custom log path
	if customPath := ctx.Query("logPath"); customPath != "" {
		logPath = customPath
	}
	
	file, err := os.Open(logPath)
	if err != nil {
		// Return empty stats if log file doesn't exist
		ctx.JSON(http.StatusOK, LogStatsResponse{
			TotalRequests: 0,
			UniqueIPs:     0,
			TopIPs:        []IPStats{},
			TopUserAgents: []UAStats{},
			Countries:     []CountryStats{},
			StatusCodes:   map[int]int{},
			RecentLogs:    []LogEntry{},
		})
		return
	}
	defer file.Close()
	
	ipCounts := make(map[string]int)
	uaCounts := make(map[string]int)
	countryCounts := make(map[string]int)
	countryCodeMap := make(map[string]string)
	statusCodes := make(map[int]int)
	var recentLogs []LogEntry
	totalRequests := 0
	
	scanner := bufio.NewScanner(file)
	// Increase buffer size for long lines
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)
	
	for scanner.Scan() {
		line := scanner.Text()
		entry := parseNginxLog(line)
		if entry == nil {
			continue
		}
		
		totalRequests++
		ipCounts[entry.IP]++
		uaCounts[entry.UserAgent]++
		statusCodes[entry.Status]++
		
		country, code := getCountryFromIP(entry.IP)
		countryCounts[country]++
		countryCodeMap[country] = code
		
		// Keep last 100 logs
		if len(recentLogs) < 100 {
			recentLogs = append([]LogEntry{*entry}, recentLogs...)
		} else {
			recentLogs = append([]LogEntry{*entry}, recentLogs[:99]...)
		}
	}
	
	// Build top IPs
	var topIPs []IPStats
	for ip, count := range ipCounts {
		country, _ := getCountryFromIP(ip)
		topIPs = append(topIPs, IPStats{IP: ip, Requests: count, Country: country})
	}
	sort.Slice(topIPs, func(i, j int) bool { return topIPs[i].Requests > topIPs[j].Requests })
	if len(topIPs) > 20 {
		topIPs = topIPs[:20]
	}
	
	// Build top User Agents
	var topUAs []UAStats
	for ua, count := range uaCounts {
		browser, os := parseBrowserOS(ua)
		topUAs = append(topUAs, UAStats{UserAgent: ua, Browser: browser, OS: os, Requests: count})
	}
	sort.Slice(topUAs, func(i, j int) bool { return topUAs[i].Requests > topUAs[j].Requests })
	if len(topUAs) > 20 {
		topUAs = topUAs[:20]
	}
	
	// Build country stats
	var countries []CountryStats
	for country, count := range countryCounts {
		percent := float64(count) / float64(totalRequests) * 100
		countries = append(countries, CountryStats{
			Country:  country,
			Code:     countryCodeMap[country],
			Requests: count,
			Percent:  percent,
		})
	}
	sort.Slice(countries, func(i, j int) bool { return countries[i].Requests > countries[j].Requests })
	
	ctx.JSON(http.StatusOK, LogStatsResponse{
		TotalRequests: totalRequests,
		UniqueIPs:     len(ipCounts),
		TopIPs:        topIPs,
		TopUserAgents: topUAs,
		Countries:     countries,
		StatusCodes:   statusCodes,
		RecentLogs:    recentLogs,
	})
}

// handleGetRecentLogs returns recent log entries with pagination
func (s *Server) handleGetRecentLogs(ctx *gin.Context) {
	logPath := "/var/log/nginx/access.log"
	limit := 50
	
	if l := ctx.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 500 {
			limit = parsed
		}
	}
	
	file, err := os.Open(logPath)
	if err != nil {
		ctx.JSON(http.StatusOK, gin.H{"logs": []LogEntry{}, "total": 0})
		return
	}
	defer file.Close()
	
	// Read file from end (tail)
	var logs []LogEntry
	var lines []string
	
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	
	// Process from end
	start := len(lines) - limit
	if start < 0 {
		start = 0
	}
	
	for i := len(lines) - 1; i >= start; i-- {
		entry := parseNginxLog(lines[i])
		if entry != nil {
			logs = append(logs, *entry)
		}
	}
	
	ctx.JSON(http.StatusOK, gin.H{
		"logs":  logs,
		"total": len(lines),
	})
}

// handleGetLiveLogs returns live log entries since last timestamp
func (s *Server) handleGetLiveLogs(ctx *gin.Context) {
	logPath := "/var/log/nginx/access.log"
	since := ctx.Query("since")
	
	file, err := os.Open(logPath)
	if err != nil {
		ctx.JSON(http.StatusOK, gin.H{"logs": []LogEntry{}, "timestamp": time.Now().Unix()})
		return
	}
	defer file.Close()
	
	var logs []LogEntry
	scanner := bufio.NewScanner(file)
	
	for scanner.Scan() {
		entry := parseNginxLog(scanner.Text())
		if entry != nil {
			// Simple time comparison (for demo)
			if since == "" || entry.Time > since {
				logs = append(logs, *entry)
			}
		}
	}
	
	// Return last 20 new entries
	if len(logs) > 20 {
		logs = logs[len(logs)-20:]
	}
	
	ctx.JSON(http.StatusOK, gin.H{
		"logs":      logs,
		"timestamp": time.Now().Unix(),
	})
}
