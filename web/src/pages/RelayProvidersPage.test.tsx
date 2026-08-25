// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RelayProvidersPage from "@/pages/RelayProvidersPage";

const apiMocks = vi.hoisted(() => ({
  getRelayProviders: vi.fn(),
  saveRelayProvider: vi.fn(),
  validateRelayProvider: vi.fn(),
  activateRelayProvider: vi.fn(),
  deleteRelayProvider: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

let container: HTMLDivElement;
let root: Root;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(label),
  );
  if (!found) throw new Error(`button not found: ${label}`);
  return found;
}

describe("RelayProvidersPage", () => {
  beforeEach(async () => {
    apiMocks.getRelayProviders.mockResolvedValue({
      endpoints: [
        {
          id: "claude-relay",
          name: "Claude Relay",
          base_url: "https://relay.example.com",
          model: "claude-opus-test",
          models: ["claude-opus-test"],
          api_mode: "anthropic_messages",
          anthropic_auth: "bearer",
          context_length: 200000,
          discover_models: true,
          is_current: false,
          has_api_key: true,
          api_key_preview: "sk-...test",
          source: "providers",
        },
      ],
      current: { provider: "", model: "", base_url: "" },
    });
    apiMocks.validateRelayProvider.mockResolvedValue({
      ok: true,
      reachable: true,
      message: "",
      latency_ms: 37,
      models: ["claude-opus-test"],
    });
    vi.stubGlobal("scrollTo", vi.fn());

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<RelayProvidersPage />));
    await flush();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("tests an Anthropic bearer relay and reports measured latency", async () => {
    await act(async () => button("Edit").click());
    await act(async () => button("Test and measure latency").click());
    await flush();

    expect(apiMocks.validateRelayProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "claude-relay",
        base_url: "https://relay.example.com",
        model: "claude-opus-test",
        api_mode: "anthropic_messages",
        anthropic_auth: "bearer",
      }),
    );
    expect(container.textContent).toContain("37 ms");
    expect(container.textContent).toContain("1 models found");
  });
});
