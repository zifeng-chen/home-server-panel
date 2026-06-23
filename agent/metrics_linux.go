//go:build linux
// +build linux

package main

import (
	"os"
	"os/exec"
	"strconv"
	"strings"
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

	// CPU — /proc/loadavg (BusyBox 和标准 Linux 通用)
	if raw, err := os.ReadFile("/proc/loadavg"); err == nil {
		parts := strings.Fields(string(raw))
		if len(parts) >= 1 {
			m.Load1m, _ = strconv.ParseFloat(parts[0], 64)
		}
	}
	// CPU cores for percentage
	if raw, err := os.ReadFile("/proc/cpuinfo"); err == nil {
		cores := float64(strings.Count(string(raw), "processor\t"))
		if cores == 0 {
			cores = float64(strings.Count(string(raw), "processor\t:"))
		}
		if cores > 0 && m.Load1m > 0 {
			m.CPU = m.Load1m / cores * 100
		}
	}

	// Memory — /proc/meminfo
	if raw, err := os.ReadFile("/proc/meminfo"); err == nil {
		var total, avail, buffers, cached uint64
		for _, line := range strings.Split(string(raw), "\n") {
			fields := strings.Fields(line)
			if len(fields) < 2 {
				continue
			}
			val, _ := strconv.ParseUint(fields[1], 10, 64)
			switch fields[0] {
			case "MemTotal:":
				total = val
			case "MemAvailable:":
				avail = val
			case "Buffers:":
				buffers = val
			case "Cached:":
				cached = val
			}
		}
		m.MemoryTotal = total * 1024
		if avail > 0 {
			// 使用 MemAvailable (Linux 3.14+)，更准确
			m.MemoryUsed = (total - avail) * 1024
		} else {
			// fallback: total - free - buffers - cached
			m.MemoryUsed = (total - buffers - cached) * 1024
		}
		if total > 0 {
			m.MemoryPct = float64(m.MemoryUsed) / float64(m.MemoryTotal) * 100
		}
	}

	// Disk — df -k (BusyBox 兼容，POSIX 标准)
	if raw, err := execCmd("df", "-k", "/"); err == nil {
		lines := strings.Split(strings.TrimSpace(raw), "\n")
		if len(lines) >= 2 {
			fields := strings.Fields(lines[1])
			if len(fields) >= 5 {
				m.DiskTotal, _ = strconv.ParseUint(fields[1], 10, 64)
				m.DiskUsed, _ = strconv.ParseUint(fields[2], 10, 64)
				m.DiskTotal *= 1024
				m.DiskUsed *= 1024
				if m.DiskTotal > 0 {
					m.DiskPct = float64(m.DiskUsed) / float64(m.DiskTotal) * 100
				}
			}
		}
	}

	// Uptime — /proc/uptime
	if raw, err := os.ReadFile("/proc/uptime"); err == nil {
		parts := strings.Fields(string(raw))
		if len(parts) >= 1 {
			up, _ := strconv.ParseFloat(parts[0], 64)
			m.Uptime = uint64(up)
		}
	}

	// Network — /proc/net/dev
	if raw, err := os.ReadFile("/proc/net/dev"); err == nil {
		for _, line := range strings.Split(string(raw), "\n") {
			line = strings.TrimSpace(line)
			// Skip header lines
			if strings.HasPrefix(line, "Inter-") || strings.HasPrefix(line, "face") {
				continue
			}
			// Format: eth0: rx... tx...
			idx := strings.Index(line, ":")
			if idx < 0 {
				continue
			}
			iface := strings.TrimSpace(line[:idx])
			// Skip lo (loopback) and virtual interfaces
			if iface == "lo" || strings.HasPrefix(iface, "veth") || strings.HasPrefix(iface, "docker") {
				continue
			}
			fields := strings.Fields(line[idx+1:])
			if len(fields) >= 10 {
				rx, _ := strconv.ParseUint(fields[0], 10, 64)
				tx, _ := strconv.ParseUint(fields[8], 10, 64)
				m.NetRx += rx
				m.NetTx += tx
			}
		}
	}

	// Processes count
	if raw, err := execCmd("ls", "-1", "/proc"); err == nil {
		count := 0
		for _, name := range strings.Split(strings.TrimSpace(raw), "\n") {
			if _, err := strconv.Atoi(strings.TrimSpace(name)); err == nil {
				count++
			}
		}
		m.Processes = count
	}

	return m
}

func execCmd(name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	out, err := cmd.Output()
	return string(out), err
}
