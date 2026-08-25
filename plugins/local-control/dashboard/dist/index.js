(function () {
  "use strict";

  const SDK = window.__HERMES_PLUGIN_SDK__;
  const React = SDK.React;
  const h = React.createElement;
  const useState = SDK.hooks.useState;
  const useEffect = SDK.hooks.useEffect;
  const useRef = SDK.hooks.useRef;
  const Button = SDK.components.Button;
  const Badge = SDK.components.Badge;
  const API = "/api/plugins/local-control";
  const PET_CATALOG = "/dashboard-plugins/local-control/dist/pet-reactions.json";
  const PET_ASSETS = "/dashboard-plugins/local-control/dist/assets/clawd-pets/";

  function pct(value) {
    return Math.max(0, Math.min(100, Number(value || 0)));
  }

  function duration(seconds) {
    const days = Math.floor((seconds || 0) / 86400);
    const hours = Math.floor(((seconds || 0) % 86400) / 3600);
    return days ? days + "d " + hours + "h" : hours + "h";
  }

  function timeLabel(timestamp) {
    if (!timestamp) return "—";
    return new Date(Number(timestamp) * 1000).toLocaleString("zh-CN", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
      second: "2-digit",
    });
  }

  function ms(value) {
    if (value === null || value === undefined) return "—";
    return Number(value) >= 1000
      ? (Number(value) / 1000).toFixed(2) + " s"
      : Math.round(Number(value)) + " ms";
  }

  function money(value) {
    return "$" + Number(value || 0).toFixed(4);
  }

  function Gauge(props) {
    return h("div", { className: "lc-gauge" },
      h("div", { className: "lc-gauge-head" },
        h("span", null, props.label),
        h("strong", null, Math.round(pct(props.value)) + "%"),
      ),
      h("div", { className: "lc-track" },
        h("i", { style: { width: pct(props.value) + "%" } }),
      ),
      h("small", null, props.detail || ""),
    );
  }

  function Stat(props) {
    return h("article", { className: "lc-stat " + (props.tone || "") },
      h("span", null, props.label),
      h("strong", null, props.value),
      h("small", null, props.hint || ""),
    );
  }

  function StatusPill(props) {
    const status = props.status || "unknown";
    const labels = { ok: "正常", error: "错误", running: "运行中", unknown: "未知" };
    return h("span", { className: "lc-status is-" + status },
      h("i", null), labels[status] || status,
    );
  }

  function CommandChip(props) {
    const ok = Boolean(props.path);
    return h("div", { className: "lc-chip " + (ok ? "is-ok" : "is-missing") },
      h("i", null), h("span", null, props.name),
      h("small", null, ok ? "ready" : "missing"),
    );
  }

  function PetCompanion(props) {
    const catalog = props.catalog || { actions: [], action_count: 0, dialogue_count: 0 };
    const actions = catalog.actions || [];
    const actionState = useState({
      slug: "waving", label: "挥手",
      line: "控制塔开机。今天的 bug 请先取号，我按报错栈叫人。",
    });
    const action = actionState[0];
    const setAction = actionState[1];
    const selectedState = useState("coding");
    const selected = selectedState[0];
    const setSelected = selectedState[1];
    const offsetState = useState({ x: 0, y: 0 });
    const offset = offsetState[0];
    const setOffset = offsetState[1];
    const bondState = useState(function () {
      return Number(window.localStorage.getItem("hermes.pet.bond") || 18);
    });
    const bond = bondState[0];
    const setBond = bondState[1];
    const energyState = useState(function () {
      return Number(window.localStorage.getItem("hermes.pet.energy") || 76);
    });
    const energy = energyState[0];
    const setEnergy = energyState[1];
    const drag = useRef(null);

    function find(slug) {
      return actions.find(function (item) { return item.slug === slug; });
    }

    function record(next, reason, nextBond, nextEnergy) {
      SDK.fetchJSON(API + "/pet-interactions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: next.slug, reason: reason, bond: nextBond, energy: nextEnergy,
        }),
      }).catch(function () {});
    }

    function perform(slug, reason) {
      if (!actions.length) return;
      let next = slug ? find(slug) : null;
      if (!next) next = actions[Math.floor(Math.random() * actions.length)];
      setAction(next);
      setSelected(next.slug);
      const bondGain = reason === "pet" ? 4 : 1;
      const energyDelta = reason === "feed" ? 16 : (reason === "sleep" ? 24 : -2);
      const nextBond = Math.min(100, bond + bondGain);
      const nextEnergy = Math.max(8, Math.min(100, energy + energyDelta));
      setBond(nextBond);
      setEnergy(nextEnergy);
      window.localStorage.setItem("hermes.pet.bond", String(nextBond));
      window.localStorage.setItem("hermes.pet.energy", String(nextEnergy));
      record(next, reason, nextBond, nextEnergy);
    }

    useEffect(function () {
      if (!actions.length) return undefined;
      const timer = window.setInterval(function () {
        if (!document.hidden && !drag.current) perform(null, "ambient");
      }, 17000);
      return function () { window.clearInterval(timer); };
    }, [actions.length, bond, energy]);

    function pointerDown(event) {
      if (event.target.closest("button,select")) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {
        x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y, moved: false,
      };
    }

    function pointerMove(event) {
      if (!drag.current) return;
      const dx = event.clientX - drag.current.x;
      const dy = event.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true;
      setOffset({
        x: Math.max(-100, Math.min(100, drag.current.ox + dx)),
        y: Math.max(-35, Math.min(55, drag.current.oy + dy)),
      });
    }

    function pointerUp(event) {
      if (!drag.current) return;
      const moved = drag.current.moved;
      drag.current = null;
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch (_) {}
      perform(moved ? "crab-walking" : "happy", moved ? "drag" : "pet");
    }

    const quick = [
      ["摸摸", "love", "pet"], ["投喂", "eating", "feed"],
      ["上工", "working-tool-calling", "work"], ["发癫", "dancing", "chaos"],
      ["睡会", "sleeping", "sleep"], ["随机", null, "random"],
    ];

    return h("aside", { className: "lc-pet-card lc-pet-compact" },
      h("div", { className: "lc-pet-topline" },
        h("span", null, "HERMES COMPANION / 赫米"),
        h("b", null, (catalog.action_count || actions.length) + " 动作 · " +
          (catalog.dialogue_count || actions.length) + " 对白"),
      ),
      h("div", {
        className: "lc-pet-stage", onPointerDown: pointerDown,
        onPointerMove: pointerMove, onPointerUp: pointerUp, onPointerCancel: pointerUp,
      },
        h("div", { className: "lc-speech", role: "status" }, action.line),
        h("div", { className: "lc-pet-aura" }),
        h("img", {
          className: "lc-pet", src: PET_ASSETS + "clawd-" + action.slug + ".svg",
          alt: "赫米正在" + action.label, draggable: false,
          style: { transform: "translate3d(" + offset.x + "px," + offset.y + "px,0)" },
        }),
        h("span", { className: "lc-pet-action" }, "正在" + action.label),
      ),
      h("div", { className: "lc-pet-meters" },
        h("label", null, h("span", null, "默契 " + bond + "%"),
          h("i", null, h("b", { style: { width: bond + "%" } }))),
        h("label", null, h("span", null, "电量 " + energy + "%"),
          h("i", null, h("b", { style: { width: energy + "%" } }))),
      ),
      h("div", { className: "lc-pet-actions" }, quick.map(function (item) {
        return h("button", {
          key: item[0], type: "button",
          onClick: function () { perform(item[1], item[2]); },
        }, item[0]);
      })),
      h("div", { className: "lc-pet-library" },
        h("select", {
          value: selected, "aria-label": "选择桌宠动作",
          onChange: function (event) { setSelected(event.target.value); },
        }, actions.map(function (item) {
          return h("option", { key: item.slug, value: item.slug }, item.label);
        })),
        h("button", {
          type: "button", onClick: function () { perform(selected, "library"); },
        }, "演一下"),
      ),
    );
  }

  function TowerView(props) {
    const tower = props.tower || {};
    const overview = props.overview || {};
    const summary = tower.summary || {};
    const endpoints = tower.endpoints || [];
    const active = tower.active || overview.active || {};
    const activeKey = String(active.base_url || "").replace(/\/$/, "") + "::" + active.model;

    return h("div", { className: "lc-view" },
      h("section", { className: "lc-stats lc-tower-stats" },
        h(Stat, {
          label: "当前模型", value: active.model || "未配置",
          hint: active.provider || "等待 API / 本地模型",
        }),
        h(Stat, {
          label: "健康端点", value: (summary.healthy || 0) + " / " + (summary.endpoints || 0),
          hint: "最近 24 小时",
        }),
        h(Stat, {
          label: "中位延迟", value: ms(summary.p50_latency_ms),
          hint: "最新可达端点 P50",
        }),
        h(Stat, {
          label: "端点可用率", value: (summary.availability_percent || 0) + "%",
          hint: "探测样本汇总",
        }),
        h(Stat, {
          label: "切换 / 错误", value: (summary.switches || 0) + " / " + (summary.errors || 0),
          hint: "持久化到 SQLite",
        }),
      ),

      h("section", { className: "lc-model-section lc-tower" },
        h("div", { className: "lc-section-head" },
          h("div", null,
            h("span", null, "MODEL CONTROL TOWER"),
            h("h2", null, "模型控制塔"),
          ),
          h("div", { className: "lc-policy" },
            h(StatusPill, { status: "running" }),
            h("div", null,
              h("strong", null, "人工切换 · 真实生效"),
              h("small", null, "自动故障转移尚未启用，当前不会假装替你路由"),
            ),
          ),
        ),
        endpoints.length ? h("div", { className: "lc-tower-grid" },
          endpoints.map(function (endpoint) {
            return h("article", {
              className: "lc-endpoint " + (endpoint.reachable ? "is-up" : "is-down"),
              key: endpoint.base_url,
            },
              h("header", null,
                h("div", { className: "lc-endpoint-name" },
                  h(StatusPill, { status: endpoint.reachable ? "ok" : "error" }),
                  h("div", null, h("strong", null, endpoint.name),
                    h("code", null, endpoint.base_url)),
                ),
                h(Badge, { variant: "outline" }, endpoint.source),
              ),
              h("div", { className: "lc-latency-grid" },
                h("label", null, h("span", null, "最新"), h("b", null, ms(endpoint.latest_latency_ms))),
                h("label", null, h("span", null, "P50"), h("b", null, ms(endpoint.p50_latency_ms))),
                h("label", null, h("span", null, "P95"), h("b", null, ms(endpoint.p95_latency_ms))),
                h("label", null, h("span", null, "可用率"), h("b", null, endpoint.availability_percent + "%")),
              ),
              h("div", { className: "lc-availability" },
                h("i", { style: { width: pct(endpoint.availability_percent) + "%" } }),
              ),
              endpoint.last_error
                ? h("div", { className: "lc-endpoint-error" }, endpoint.last_error)
                : null,
              h("div", { className: "lc-model-list" },
                (endpoint.models || []).length
                  ? endpoint.models.map(function (model) {
                      const key = endpoint.base_url.replace(/\/$/, "") + "::" + model;
                      const selected = key === activeKey;
                      return h("div", { className: "lc-model-row", key: model },
                        h("span", null, model),
                        h(Button, {
                          size: "sm", variant: selected ? "secondary" : "outline",
                          disabled: selected || props.busy === key || !endpoint.reachable,
                          onClick: function () { props.activate(endpoint, model); },
                        }, selected ? "正在使用" :
                          (props.busy === key ? "切换中…" : "切换到此模型")),
                      );
                    })
                  : h("div", { className: "lc-no-model" },
                      endpoint.reachable ? "服务可达，但当前没有已加载模型。" : "端点离线。"),
              ),
              h("footer", null,
                h("span", null, (endpoint.samples || 0) + " 个样本"),
                h("span", null, "最后探测 " + timeLabel(endpoint.last_seen)),
              ),
            );
          })
        ) : h("div", { className: "lc-empty" },
          h("strong", null, "还没有探测样本"),
          h("p", null, "点击右上角“立即探测”。支持 Ollama、LM Studio、vLLM、llama.cpp、LocalAI 与 SGLang。"),
          h("code", null, "OLLAMA_CONTEXT_LENGTH=65536 ollama serve"),
        ),
      ),

      h("section", { className: "lc-history-grid" },
        h("article", { className: "lc-panel" },
          h("header", null, h("div", null,
            h("span", null, "MODEL SWITCH HISTORY"), h("h2", null, "模型切换历史"))),
          (tower.switches || []).length ? h("div", { className: "lc-event-list" },
            tower.switches.map(function (item) {
              return h("div", { className: "lc-event", key: item.id },
                h(StatusPill, { status: item.success ? "ok" : "error" }),
                h("div", null, h("strong", null, item.model),
                  h("small", null, (item.previous_model || "未配置") + " → " +
                    item.model + " · " + ms(item.latency_ms))),
                h("time", null, timeLabel(item.ts)),
              );
            })
          ) : h("div", { className: "lc-soft-empty" }, "还没有模型切换记录。"),
        ),
        h("article", { className: "lc-panel" },
          h("header", null, h("div", null,
            h("span", null, "PRIVACY & RETENTION"), h("h2", null, "本地隐私边界"))),
          h("ul", { className: "lc-privacy-list" },
            h("li", null, h("b", null, "✓"), " 不保存提示词和回复正文"),
            h("li", null, h("b", null, "✓"), " 不保存工具参数和工具结果"),
            h("li", null, h("b", null, "✓"), " URL 去掉账号、查询串与片段"),
            h("li", null, h("b", null, "✓"), " 错误中的 Key / Token 自动脱敏"),
            h("li", null, h("b", null, "✓"), " 运行元数据保留 30 天"),
          ),
          h("div", { className: "lc-db-note" },
            h("code", null, "~/.hermes/plugin-data/local-control/control-tower.db"),
            h("small", null, "SQLite WAL · 只存运行元数据"),
          ),
        ),
      ),
    );
  }

  function TraceView(props) {
    const traces = (props.traces && props.traces.traces) || [];
    const selectedState = useState(null);
    const selected = selectedState[0];
    const setSelected = selectedState[1];
    const loadingState = useState("");
    const loading = loadingState[0];
    const setLoading = loadingState[1];
    const filterState = useState("all");
    const filter = filterState[0];
    const setFilter = filterState[1];

    function selectTrace(item) {
      setLoading(item.trace_id);
      SDK.fetchJSON(API + "/traces/" + encodeURIComponent(item.trace_id))
        .then(setSelected)
        .catch(function (err) {
          setSelected({ trace_id: item.trace_id, error: String(err), steps: [] });
        })
        .finally(function () { setLoading(""); });
    }

    const shown = filter === "all" ? traces :
      traces.filter(function (item) { return item.kind === filter; });
    const sessions = traces.filter(function (item) { return item.kind === "session"; }).length;
    const errors = traces.filter(function (item) { return item.status === "error"; }).length;
    const running = traces.filter(function (item) { return item.status === "running"; }).length;

    return h("div", { className: "lc-view" },
      h("section", { className: "lc-stats lc-trace-stats" },
        h(Stat, { label: "追踪条目", value: String(traces.length), hint: "最近的运行与控制事件" }),
        h(Stat, { label: "Agent 会话", value: String(sessions), hint: "直接读取 Hermes SessionDB" }),
        h(Stat, { label: "运行中", value: String(running), hint: "尚未结束的会话" }),
        h(Stat, { label: "错误", value: String(errors), hint: "探测、切换与后端错误" }),
        h(Stat, { label: "内容采集", value: "关闭", hint: "仅展示结构化元数据" }),
      ),
      h("section", { className: "lc-trace-shell" },
        h("article", { className: "lc-trace-list-panel" },
          h("header", { className: "lc-trace-head" },
            h("div", null, h("span", null, "RUNTIME TRACE CENTER"),
              h("h2", null, "运行追踪中心")),
            h("div", { className: "lc-filters" },
              [
                ["all", "全部"], ["session", "Agent"], ["probe", "探测"],
                ["switch", "切换"], ["error", "错误"],
              ].map(function (item) {
                return h("button", {
                  key: item[0], className: filter === item[0] ? "is-active" : "",
                  onClick: function () { setFilter(item[0]); },
                }, item[1]);
              }),
            ),
          ),
          h("div", { className: "lc-trace-table" },
            shown.length ? shown.map(function (item) {
              return h("button", {
                className: "lc-trace-row " +
                  (selected && selected.trace_id === item.trace_id ? "is-selected" : ""),
                key: item.trace_id, onClick: function () { selectTrace(item); },
              },
                h("span", { className: "lc-trace-kind is-" + item.kind },
                  { session: "AG", probe: "PR", switch: "SW", error: "ER" }[item.kind] || "EV"),
                h("div", { className: "lc-trace-main" },
                  h("strong", null, item.name || item.kind),
                  h("code", null, item.model || item.base_url || item.trace_id),
                ),
                h(StatusPill, { status: item.status }),
                h("div", { className: "lc-trace-metrics" },
                  h("b", null, ms(item.duration_ms)),
                  h("small", null,
                    item.kind === "session"
                      ? (item.message_count || 0) + " 消息 · " +
                        (item.tool_call_count || 0) + " 工具"
                      : timeLabel(item.started_at)),
                ),
                loading === item.trace_id ? h("i", { className: "lc-row-loader" }) : null,
              );
            }) : h("div", { className: "lc-soft-empty" }, "当前筛选下没有追踪记录。"),
          ),
        ),
        h("aside", { className: "lc-trace-detail" },
          selected ? h(React.Fragment, null,
            h("header", null,
              h("div", null, h("span", null, "TRACE INSPECTOR"),
                h("h2", null, selected.kind === "session" ? "Agent 运行详情" : "控制事件详情")),
              h(StatusPill, { status: selected.status || "error" }),
            ),
            selected.error ? h("div", { className: "lc-endpoint-error" }, selected.error) : null,
            h("dl", { className: "lc-trace-facts" },
              h("div", null, h("dt", null, "Trace ID"), h("dd", null, selected.trace_id)),
              h("div", null, h("dt", null, "模型"), h("dd", null, selected.model || "—")),
              h("div", null, h("dt", null, "Provider"), h("dd", null, selected.provider || "—")),
              h("div", null, h("dt", null, "Tokens"),
                h("dd", null, (selected.input_tokens || 0) + " in / " +
                  (selected.output_tokens || 0) + " out")),
              h("div", null, h("dt", null, "估算成本"),
                h("dd", null, money(selected.estimated_cost_usd))),
            ),
            h("div", { className: "lc-span-title" },
              h("strong", null, "Span 时间线"),
              h("small", null, ((selected.steps || []).length) + " 步"),
            ),
            h("ol", { className: "lc-span-list" },
              (selected.steps || []).map(function (step, index) {
                return h("li", { key: step.span_id || index },
                  h("i", { className: "is-" + (step.kind || "event") }),
                  h("div", null, h("strong", null, step.name || step.kind),
                    h("small", null, step.kind + " · " +
                      (step.timestamp ? timeLabel(step.timestamp) : "结构化事件"))),
                  h(StatusPill, { status: step.status || "ok" }),
                );
              }),
            ),
            h("div", { className: "lc-privacy-banner" },
              "🔒 此视图不返回提示词正文、回复正文、工具参数或工具结果。"),
          ) : h("div", { className: "lc-detail-empty" },
            h("div", null, "⌁"), h("strong", null, "选择一条追踪"),
            h("p", null, "查看模型、耗时、Tokens、工具步骤和状态。内容默认不采集。"),
          ),
        ),
      ),
    );
  }

  function OverviewView(props) {
    const data = props.overview;
    const system = data.system || {};
    const active = data.active || {};
    const healthy = (data.endpoints || []).filter(function (item) { return item.reachable; });
    const commands = data.commands || {};
    const gpus = data.gpus || [];

    return h("div", { className: "lc-view" },
      h("section", { className: "lc-stats" },
        h(Stat, { label: "Active model", value: active.model || "Not configured", hint: active.provider || "provider unknown" }),
        h(Stat, { label: "Local servers", value: String(healthy.length), hint: "live compatible endpoints" }),
        h(Stat, { label: "Skills", value: String(active.skill_count || 0), hint: "installed procedural memories" }),
        h(Stat, { label: "MCP servers", value: String(active.mcp_count || 0), hint: "configured tool bridges" }),
        h(Stat, { label: "Uptime", value: duration(system.uptime_seconds), hint: data.platform.wsl ? "Windows / WSL2" : data.platform.name }),
      ),
      h("section", { className: "lc-grid" },
        h("article", { className: "lc-panel lc-health" },
          h("header", null, h("div", null,
            h("span", null, "SYSTEM TELEMETRY"), h("h2", null, "Hardware pulse"))),
          h(Gauge, { label: "CPU", value: system.cpu_percent, detail: (system.cpu_count || "?") + " logical cores" }),
          h(Gauge, { label: "Memory", value: system.memory_percent, detail: (system.memory_used_gb || 0) + " / " + (system.memory_total_gb || 0) + " GB" }),
          h(Gauge, { label: "Disk", value: system.disk_percent, detail: (system.disk_used_gb || 0) + " / " + (system.disk_total_gb || 0) + " GB" }),
          gpus.length ? gpus.map(function (gpu, index) {
            return h(Gauge, { key: index, label: "GPU · " + gpu.name, value: gpu.memory_percent, detail: gpu.utilization_percent + "% compute · " + gpu.temperature_c + "°C" });
          }) : h("div", { className: "lc-gpu-empty" }, "No NVIDIA telemetry; CPU/Apple/AMD inference remains supported."),
        ),
        h("article", { className: "lc-panel lc-runtime" },
          h("header", null, h("div", null,
            h("span", null, "RUNTIME MATRIX"), h("h2", null, "Dependencies"))),
          h("div", { className: "lc-chips" }, Object.keys(commands).map(function (name) {
            return h(CommandChip, { key: name, name: name, path: commands[name] });
          })),
          h("div", { className: "lc-config-card" },
            h("span", null, "ACTIVE ENDPOINT"),
            h("code", null, active.base_url || "No local endpoint selected"),
            h("small", null, "Context: " + (active.context_length || "auto") + " tokens"),
          ),
          h("nav", { className: "lc-links" },
            h("a", { href: "/chat" }, "Open chat →"),
            h("a", { href: "/sessions" }, "Sessions →"),
            h("a", { href: "/skills" }, "Skills →"),
            h("a", { href: "/mcp" }, "MCP catalog →"),
            h("a", { href: "/config" }, "Configuration →"),
          ),
        ),
      ),
    );
  }

  function LocalDeck() {
    const overviewState = useState(null);
    const overview = overviewState[0];
    const setOverview = overviewState[1];
    const towerState = useState(null);
    const tower = towerState[0];
    const setTower = towerState[1];
    const tracesState = useState(null);
    const traces = tracesState[0];
    const setTraces = tracesState[1];
    const catalogState = useState(null);
    const catalog = catalogState[0];
    const setCatalog = catalogState[1];
    const tabState = useState("tower");
    const tab = tabState[0];
    const setTab = tabState[1];
    const errorState = useState("");
    const error = errorState[0];
    const setError = errorState[1];
    const busyState = useState("");
    const busy = busyState[0];
    const setBusy = busyState[1];
    const scanState = useState(false);
    const scanning = scanState[0];
    const setScanning = scanState[1];

    function load(refresh) {
      setError("");
      if (refresh) setScanning(true);
      const overviewUrl = API + "/overview" + (refresh ? "?refresh=true" : "");
      return SDK.fetchJSON(overviewUrl)
        .then(function (nextOverview) {
          setOverview(nextOverview);
          return Promise.all([
            SDK.fetchJSON(API + "/control-tower"),
            SDK.fetchJSON(API + "/traces?limit=100"),
          ]);
        })
        .then(function (values) {
          setTower(values[0]);
          setTraces(values[1]);
        })
        .catch(function (err) { setError(String(err)); })
        .finally(function () { setScanning(false); });
    }

    function activate(endpoint, model) {
      const key = endpoint.base_url + "::" + model;
      setBusy(key);
      setError("");
      SDK.fetchJSON(API + "/activate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_url: endpoint.base_url, model: model, context_length: 65536,
        }),
      }).then(function () { return load(true); })
        .catch(function (err) { setError(String(err)); })
        .finally(function () { setBusy(""); });
    }

    useEffect(function () {
      load(false);
      window.fetch(PET_CATALOG, { cache: "no-store" })
        .then(function (response) {
          if (!response.ok) throw new Error("pet catalog " + response.status);
          return response.json();
        })
        .then(setCatalog)
        .catch(function (err) { setError(String(err)); });
      const timer = window.setInterval(function () { load(false); }, 15000);
      return function () { window.clearInterval(timer); };
    }, []);

    if (!overview || !tower || !traces) {
      return h("div", { className: "lc-loading" },
        h("i", null), h("span", null, error || "正在建立模型控制塔…"));
    }

    const active = overview.active || {};
    const healthy = (overview.endpoints || []).filter(function (item) {
      return item.reachable;
    }).length;

    return h("div", { className: "lc-page" },
      h("section", { className: "lc-hero lc-command-hero" },
        h("div", { className: "lc-hero-copy" },
          h("div", { className: "lc-kicker" }, "HERMES OPS / 本地智能体作战室"),
          h("h1", null, "Control Tower"),
          h("p", null,
            "模型健康、探测延迟、真实切换、Agent 运行轨迹和错误历史汇成一个本地控制面。看得到的都接上了数据，没生效的功能会明确告诉你。"),
          h("div", { className: "lc-hero-actions" },
            h(Badge, { className: overview.ready ? "lc-ready" : "lc-warn" },
              overview.ready ? "● AGENT READY" : "● MODEL NEEDED"),
            h(StatusPill, { status: healthy ? "ok" : "error" }),
            h(Button, {
              variant: "outline", disabled: scanning,
              onClick: function () { load(true); },
            }, scanning ? "探测中…" : "立即探测"),
          ),
          h("div", { className: "lc-active-strip" },
            h("span", null, "ACTIVE"),
            h("strong", null, active.model || "尚未选择模型"),
            h("code", null, active.base_url || "等待本地服务或 API 配置"),
          ),
        ),
        h(PetCompanion, { catalog: catalog }),
      ),

      h("nav", { className: "lc-tabs", "aria-label": "控制塔页面" },
        [
          ["tower", "◉", "模型控制塔", "健康、延迟与切换"],
          ["traces", "⌁", "运行追踪", "会话、工具与错误"],
          ["overview", "✦", "系统总览", "硬件与依赖"],
        ].map(function (item) {
          return h("button", {
            key: item[0], className: tab === item[0] ? "is-active" : "",
            onClick: function () { setTab(item[0]); },
          }, h("i", null, item[1]), h("span", null,
            h("strong", null, item[2]), h("small", null, item[3])));
        }),
      ),

      error ? h("div", { className: "lc-error" }, error) : null,

      tab === "tower"
        ? h(TowerView, {
            tower: tower, overview: overview, busy: busy, activate: activate,
          })
        : tab === "traces"
          ? h(TraceView, { traces: traces })
          : h(OverviewView, { overview: overview }),

      h("footer", { className: "lc-footer" },
        h("span", null, "Hermes Local · Control Tower + Trace Center"),
        h("span", null, "Python " + overview.platform.python + " · " +
          (overview.platform.wsl ? "WSL2" : "native") + " · SQLite WAL"),
      ),
    );
  }

  window.__HERMES_PLUGINS__.register("local-control", LocalDeck);
})();
