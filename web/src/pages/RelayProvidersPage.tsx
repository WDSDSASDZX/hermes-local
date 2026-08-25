import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Gauge, KeyRound, Network, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

import {
  api,
  type AnthropicAuthMode,
  type CustomEndpoint,
  type CustomEndpointApiMode,
  type CustomEndpointUpdate,
} from "@/lib/api";

const modes: Array<[CustomEndpointApiMode, string]> = [
  ["anthropic_messages", "Anthropic Messages"],
  ["chat_completions", "OpenAI Chat Completions"],
  ["codex_responses", "OpenAI Responses / Codex"],
  ["bedrock_converse", "AWS Bedrock Converse"],
];

const blank: CustomEndpointUpdate = {
  id: "",
  name: "",
  base_url: "",
  model: "",
  models: [],
  api_key: "",
  api_mode: "anthropic_messages",
  anthropic_auth: "auto",
  context_length: 200000,
  discover_models: true,
  make_default: false,
};

const inputClass =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:opacity-60";

function toForm(endpoint: CustomEndpoint): CustomEndpointUpdate {
  return {
    id: endpoint.id,
    name: endpoint.name,
    base_url: endpoint.base_url,
    model: endpoint.model,
    models: endpoint.models,
    api_key: undefined,
    api_mode: endpoint.api_mode,
    anthropic_auth: endpoint.anthropic_auth,
    context_length: endpoint.context_length ?? 200000,
    discover_models: endpoint.discover_models,
    make_default: endpoint.is_current,
  };
}

export default function RelayProvidersPage() {
  const [endpoints, setEndpoints] = useState<CustomEndpoint[]>([]);
  const [currentProvider, setCurrentProvider] = useState("");
  const [form, setForm] = useState<CustomEndpointUpdate>({ ...blank });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  const valid = useMemo(
    () => Boolean(form.name.trim() && form.base_url.trim() && form.model.trim()),
    [form],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getRelayProviders();
      setEndpoints(result.endpoints);
      setCurrentProvider(result.current.provider);
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Failed to load relays" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = Promise.resolve().then(load);
    void initialLoad;
  }, [load]);

  function update<K extends keyof CustomEndpointUpdate>(key: K, value: CustomEndpointUpdate[K]) {
    setForm((old) => ({ ...old, [key]: value }));
  }

  function reset() {
    setEditingId(null);
    setForm({ ...blank });
  }

  function edit(endpoint: CustomEndpoint) {
    setEditingId(endpoint.id);
    setForm(toForm(endpoint));
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function testRelay() {
    setBusy("test");
    setNotice(null);
    try {
      const result = await api.validateRelayProvider({ ...form, id: editingId ?? form.id });
      if (result.models.length) {
        setForm((old) => ({
          ...old,
          models: result.models,
          model: old.model || result.models[0],
        }));
      }
      const latency = result.latency_ms === null ? "" : ` in ${result.latency_ms} ms`;
      setNotice({
        error: !result.ok,
        text: result.ok
          ? `${result.message || "Relay is reachable"}${latency}; ${result.models.length} models found`
          : `${result.message || "Relay test failed"}${latency}`,
      });
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Relay test failed" });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setNotice(null);
    try {
      await api.saveRelayProvider({ ...form, id: editingId ?? form.id });
      await load();
      reset();
      setNotice({ error: false, text: "Relay provider saved locally." });
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Save failed" });
    } finally {
      setBusy(null);
    }
  }

  async function activate(id: string) {
    setBusy(`activate:${id}`);
    try {
      await api.activateRelayProvider(id);
      await load();
      setNotice({ error: false, text: "Relay is now the active Hermes provider." });
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Activation failed" });
    } finally {
      setBusy(null);
    }
  }

  async function remove(endpoint: CustomEndpoint) {
    if (!window.confirm(`Delete relay provider "${endpoint.name}"?`)) return;
    setBusy(`delete:${endpoint.id}`);
    try {
      await api.deleteRelayProvider(endpoint.id);
      if (editingId === endpoint.id) reset();
      await load();
      setNotice({ error: false, text: "Relay provider deleted." });
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Delete failed" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl border border-sky-200/70 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-6 shadow-sm dark:border-sky-900 dark:from-slate-950 dark:via-slate-900 dark:to-violet-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-sky-700 dark:text-sky-300">
              <Network className="h-4 w-4" /> Multi-protocol model gateway
            </div>
            <h1 className="text-3xl font-bold">Relay Providers</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Connect Claude and other models through Anthropic, OpenAI-compatible,
              Responses, or Bedrock relays. Hermes stores and uses these settings
              directly, so CC Switch does not need to be running.
            </p>
          </div>
          <button onClick={reset} className="rounded-xl border bg-background px-4 py-2 text-sm font-semibold shadow-sm hover:bg-muted">
            <Plus className="mr-2 inline h-4 w-4" /> New relay
          </button>
        </div>
      </header>

      {notice && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${notice.error ? "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200" : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>
          {notice.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">{editingId ? "Edit relay" : "Add relay"}</h2>
          <p className="mb-5 text-sm text-muted-foreground">Use the exact URL and model ID supplied by the relay.</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provider name">
              <input className={inputClass} value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="My Claude relay" />
            </Field>
            <Field label="Provider ID" hint="Optional; generated from the name">
              <input className={inputClass} value={form.id} disabled={Boolean(editingId)} onChange={(event) => update("id", event.target.value)} placeholder="claude-relay" />
            </Field>
            <Field label="Request URL" hint="Root URL or /v1 base URL">
              <input className={inputClass} value={form.base_url} onChange={(event) => update("base_url", event.target.value)} placeholder="https://relay.example.com" />
            </Field>
            <Field label="API format">
              <select className={inputClass} value={form.api_mode} onChange={(event) => update("api_mode", event.target.value as CustomEndpointApiMode)}>
                {modes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            {form.api_mode === "anthropic_messages" && (
              <Field label="Authentication header" hint="Use Bearer for ANTHROPIC_AUTH_TOKEN relays">
                <select className={inputClass} value={form.anthropic_auth} onChange={(event) => update("anthropic_auth", event.target.value as AnthropicAuthMode)}>
                  <option value="auto">Auto detect</option>
                  <option value="x_api_key">x-api-key</option>
                  <option value="bearer">Authorization: Bearer</option>
                </select>
              </Field>
            )}
            <Field label="API key" hint={editingId ? "Leave untouched to keep the stored key" : "Stored in the local .env file"}>
              <input className={inputClass} type="password" value={form.api_key ?? ""} onChange={(event) => update("api_key", event.target.value || undefined)} placeholder={editingId ? "Keep current key" : "Enter relay key"} autoComplete="new-password" />
            </Field>
            <Field label="Default model" hint="Exact upstream model ID">
              <input className={inputClass} value={form.model} onChange={(event) => update("model", event.target.value)} placeholder="claude-opus-4-1" list="relay-models" />
              <datalist id="relay-models">{(form.models ?? []).map((model) => <option key={model} value={model} />)}</datalist>
            </Field>
            <Field label="Context length">
              <input className={inputClass} type="number" min={1} value={form.context_length ?? 200000} onChange={(event) => update("context_length", Number(event.target.value))} />
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap gap-5 rounded-xl bg-muted/50 p-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.discover_models ?? true} onChange={(event) => update("discover_models", event.target.checked)} /> Discover models during test</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.make_default ?? false} onChange={(event) => update("make_default", event.target.checked)} /> Make active after save</label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button disabled={!form.base_url || busy !== null} onClick={() => void testRelay()} className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">
              <Gauge className="mr-2 inline h-4 w-4" /> {busy === "test" ? "Testing..." : "Test and measure latency"}
            </button>
            <button disabled={!valid || busy !== null} onClick={() => void save()} className="rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
              {busy === "save" ? "Saving..." : "Save relay"}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div><h2 className="text-lg font-semibold">Configured relays</h2><p className="text-sm text-muted-foreground">Switch providers without editing env files.</p></div>
            <button aria-label="Refresh relay providers" className="rounded-lg p-2 hover:bg-muted" onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          </div>

          {loading ? <p className="py-12 text-center text-sm text-muted-foreground">Loading...</p> : endpoints.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No relays configured yet.</p>
          ) : (
            <div className="space-y-3">
              {endpoints.map((endpoint) => {
                const active = endpoint.is_current || endpoint.id === currentProvider;
                return (
                  <article key={endpoint.id} className={`rounded-xl border p-4 ${active ? "border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20" : "hover:border-sky-300"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{endpoint.name}</h3>
                      {active && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white"><Check className="mr-1 inline h-3 w-3" />Active</span>}
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-950 dark:text-sky-200">{modes.find(([value]) => value === endpoint.api_mode)?.[1]}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{endpoint.base_url}</p>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>Model: {endpoint.model}</span>
                      <span><KeyRound className="mr-1 inline h-3 w-3" />{endpoint.api_key_preview || "No key"}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {!active && <button disabled={busy !== null} onClick={() => void activate(endpoint.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{busy === `activate:${endpoint.id}` ? "Activating..." : "Activate"}</button>}
                      <button onClick={() => edit(endpoint)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><Pencil className="mr-1 inline h-3 w-3" />Edit</button>
                      <button disabled={busy !== null} onClick={() => void remove(endpoint)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300"><Trash2 className="mr-1 inline h-3 w-3" />Delete</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="space-y-1.5 text-sm font-medium"><span>{label}</span>{children}{hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}</label>;
}
