//go:build darwin
// +build darwin

package main

import (
	"os/exec"
	"strconv"
	"strings"
	"time"
)

type MetricData struct {
	CPU        float64
	MemoryPct  float64
	MemoryUsed uint64
	MemoryTotal uint64
	DiskPct    float64
	DiskUsed   uint64
	DiskTotal  uint64
	NetRx      uint64
	NetTx      uint64
	Uptime     uint64
	Load1m     float64
	Processes  int
}

func MetricsSnapshot() MetricData {
	m := MetricData{}

	// CPU loadavg
	if raw, err := execCmd("sysctl", "-n", "vm.loadavg"); err == nil {
		// "{ 1.23 0.89 0.45 }" → parse first
		raw = strings.Trim(raw, "{} \n\t")
		parts := strings.Fields(raw)
		if len(parts) >= 1 {
			m.Load1m, _ = strconv.ParseFloat(parts[0], 64)
		}
	}
	// CPU usage percent (derived from loadavg vs CPU cores)
	if raw, err := execCmd("sysctl", "-n", "hw.ncpu"); err == nil {
		cores, _ := strconv.ParseFloat(strings.TrimSpace(raw), 64)
		if cores > 0 {
			m.CPU = m.Load1m / cores * 100
		}
	}

	// Memory
	if raw, err := execCmd("sysctl", "-n", "hw.memsize"); err == nil {
		m.MemoryTotal, _ = strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
	}
	// vm_stat page size 4096 on Apple Silicon
	pageSize := uint64(4096)
	if raw, err := execCmd("vm_stat"); err == nil {
		var active, wired uint64
		for _, line := range strings.Split(raw, "\n") {
			line = strings.TrimSpace(line)
			if strings.Contains(line, "page size of") {
				ps := strings.Fields(line)
				if len(ps) >= 7 {
					pageSize, _ = strconv.ParseUint(ps[7], 10, 64)
				}
			} else if strings.Contains(line, "Pages active:") {
				active = parsePageField(line)
			} else if strings.Contains(line, "Pages wired down:") {
				wired = parsePageField(line)
			}
		}
		usedBytes := (active + wired) * pageSize
		m.MemoryUsed = usedBytes
		if m.MemoryTotal > 0 {
			m.MemoryPct = float64(usedBytes) / float64(m.MemoryTotal) * 100
		}
	}

	// Disk
	if raw, err := execCmd("df", "-k", "/"); err == nil {
		parseDiskInfo(&m, raw)
	}

	// Uptime
	if raw, err := execCmd("sysctl", "-n", "kern.boottime"); err == nil {
		// "{ sec = 1234567890, usec = 0 }"
		raw = strings.Trim(raw, "{} \n\t")
		for _, part := range strings.Split(raw, ",") {
			kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
			if len(kv) == 2 && strings.TrimSpace(kv[0]) == "sec" {
				bootTime, _ := strconv.ParseInt(strings.TrimSpace(kv[1]), 10, 64)
				m.Uptime = uint64(time.Now().Unix() - bootTime)
			}
		}
	}

	// Network (active interfaces sum)
	if raw, err := execCmd("netstat", "-ib"); err == nil {
		parseMacNetStat(&m, raw)
	}

	// Processes
	if raw, err := execCmd("ps", "-eo", "pid"); err == nil {
		m.Processes = strings.Count(raw, "\n")
	}

	return m
}

func execCmd(name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	out, err := cmd.Output()
	return string(out), err
}

func parsePageField(line string) uint64 {
	parts := strings.Fields(line)
	if len(parts) >= 4 {
		// strip trailing dot
		val := strings.TrimRight(parts[3], ".")
		n, _ := strconv.ParseUint(val, 10, 64)
		return n
	}
	return 0
}

func parseDiskInfo(m *MetricData, raw string) {
	lines := strings.Split(strings.TrimSpace(raw), "\n")
	if len(lines) < 2 {
		return
	}
	fields := strings.Fields(lines[1])
	if len(fields) < 5 {
		return
	}
	m.DiskTotal, _ = strconv.ParseUint(fields[1], 10, 64)
	m.DiskUsed, _ = strconv.ParseUint(fields[2], 10, 64)
	m.DiskTotal *= 1024  // KB → bytes
	m.DiskUsed *= 1024
	if m.DiskTotal > 0 {
		m.DiskPct = float64(m.DiskUsed) / float64(m.DiskTotal) * 100
	}
}

func parseMacNetStat(m *MetricData, raw string) {
	var rx, tx uint64
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		// Only count physical interfaces (en0, enX)
		if !strings.HasPrefix(line, "en") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 10 {
			continue
		}
		rxBytes, _ := strconv.ParseUint(fields[6], 10, 64)
		txBytes, _ := strconv.ParseUint(fields[9], 10, 64)
		rx += rxBytes
		tx += txBytes
	}
	m.NetRx = rx
	m.NetTx = tx
}
