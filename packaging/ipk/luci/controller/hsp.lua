-- HSP Panel LuCI Controller
-- 在服务菜单提供状态查看 + 启停控制
module("luci.controller.hsp", package.seeall)

function index()
    entry({"admin", "services", "hsp-panel"}, firstchild(), _("HSP 管理面板"), 80).dependent = false
    entry({"admin", "services", "hsp-panel", "page"}, template("hsp/main"), _("面板首页"), 10).leaf = true
    entry({"admin", "services", "hsp-panel", "api", "status"}, call("api_status")).leaf = true
    entry({"admin", "services", "hsp-panel", "api", "start"}, call("api_start")).leaf = true
    entry({"admin", "services", "hsp-panel", "api", "stop"}, call("api_stop")).leaf = true
    entry({"admin", "services", "hsp-panel", "api", "restart"}, call("api_restart")).leaf = true
end

local function json_response(data)
    local http = require "luci.http"
    local jsonc = require "luci.jsonc"
    http.prepare_content("application/json")
    http.write(jsonc.stringify(data))
end

local function hsp_status()
    local sys = require "luci.sys"
    local pid = sys.exec("pgrep -f 'node.*src/server.js'"):gsub("\n", " "):match("^(%d+)")
    local running = (pid ~= nil and #pid > 0)
    local lan_ip = sys.exec("uci get network.lan.ipaddr 2>/dev/null"):gsub("\n", "")
    local port = "3456"
    local env_file = "/opt/hsp-panel/app/.env"
    local fs = require("nixio.fs")
    if fs and fs.access and fs.access(env_file) then
        for line in io.lines(env_file) do
            local k, v = line:match("^(PORT)=(.-)$")
            if k and v and tonumber(v) then port = v:gsub("%s", "") end
        end
    end
    return {
        running = running,
        pid = pid or "",
        port = tonumber(port) or 3456,
        lan_ip = lan_ip,
        url = "http://" .. (lan_ip ~= "" and lan_ip or "路由器") .. ":" .. port
    }
end

function api_status()
    json_response({ ok = true, data = hsp_status() })
end

function api_start()
    local sys = require "luci.sys"
    local rc = sys.call("/etc/init.d/hsp-panel start >/dev/null 2>&1")
    json_response({ ok = (rc == 0), rc = rc, data = hsp_status() })
end

function api_stop()
    local sys = require "luci.sys"
    local rc = sys.call("/etc/init.d/hsp-panel stop >/dev/null 2>&1")
    json_response({ ok = (rc == 0), rc = rc, data = hsp_status() })
end

function api_restart()
    local sys = require "luci.sys"
    local rc = sys.call("/etc/init.d/hsp-panel restart >/dev/null 2>&1")
    json_response({ ok = (rc == 0), rc = rc, data = hsp_status() })
end
