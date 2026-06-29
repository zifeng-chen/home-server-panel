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

// CPU delta tracking (跨 collectMetrics 调用)
var (
	prevCPUIdle  uint64
	prevCPUTotal uint64
)

func MetricsSnapshot() MetricData {
	m := MetricData{}

	// Load 1m (参考值，显示在面板)
	if raw, err := os.ReadFile("/proc/loadavg"); err == nil {
		parts := strings.Fields(string(raw))
		if len(parts) >= 1 {
			m.Load1m, _ = strconv.ParseFloat(parts[0], 64)
		}
	}

	// CPU% — /proc/stat delta 算法 (扣除 idle/iowait)
	// /proc/stat 第一行: cpu  user nice system idle iowait irq softirq steal ...
	if raw, err := os.ReadFile("/proc/stat"); err == nil {
		lines := strings.Split(string(raw), "\n")
		var user, nice, system, idle, iowait, irq, softirq, steal uint64
		for _, line := range lines {
			if strings.HasPrefix(line, "cpu ") {
				fields := strings.Fields(line)
				if len(fields) >= 8 {
					user, _ = strconv.ParseUint(fields[1], 10, 64)
					nice, _ = strconv.ParseUint(fields[2], 10, 64)
					system, _ = strconv.ParseUint(fields[3], 10, 64)
					idle, _ = strconv.ParseUint(fields[4], 10, 64)
					iowait, _ = strconv.ParseUint(fields[5], 10, 64)
					irq, _ = strconv.ParseUint(fields[6], 10, 64)
					softirq, _ = strconv.ParseUint(fields[7], 10, 64)
					if len(fields) >= 9 {
						steal, _ = strconv.ParseUint(fields[8], 10, 64)
					}
				}
				break
			}
		}
		total := user + nice + system + idle + iowait + irq + softirq + steal
		active := total - idle - iowait // 排除空闲和 IO 等待 = 真正 CPU 使用
		if prevCPUTotal > 0 && total > prevCPUTotal {
			dt := total - prevCPUTotal
			da := active - (prevCPUTotal - prevCPUIdle)
			if dt > 0 {
				m.CPU = float64(da) / float64(dt) * 100
			}
		}
		prevCPUIdle = idle + iowait
		prevCPUTotal = total
	}
	// Fallback: 首次数值缺失时用 Load/cores 粗略估计
	if m.CPU == 0 && m.Load1m > 0 {
		if raw, err := os.ReadFile("/proc/cpuinfo"); err == nil {
			cores := float64(strings.Count(string(raw), "processor\t"))
			if cores == 0 {
				cores = float64(strings.Count(string(raw), "processor\t:"))
			}
			if cores > 0 {
				m.CPU = m.Load1m / cores * 100
			}
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
