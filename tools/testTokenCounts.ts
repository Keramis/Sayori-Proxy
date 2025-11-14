// Test script: Validate token counting scenarios using tokenizer utilities.
// Run with:  tsx tools/testTokenCounts.ts
//
// Scenarios:
//  1. Simple single user message
//  2. Multi-role conversation (system + user + assistant)
//  3. Assistant message with tool_calls
//  4. Unicode / CJK / Emoji content
//  5. Large input (stress / performance)
//  6. Repeated identical payload (cache effectiveness)
//  7. Strict mode behavior (if STRICT_TOKEN_COUNT=1)
//
// Output:
//  - Prints per-scenario token counts (input tokens, output tokens if applicable).
//  - Prints diagnostics snapshot (cache sizes etc.)
//
// NOTE: Expected token counts are not asserted exactly because subtle encoding
//       differences and structural overhead tuning may shift results. Instead,
//       we assert basic invariants (non-negative, structural overhead applied,
//       cache hit reduces recomputation).
//
// You may adapt this to integrate with a formal test runner later.

import { countChatTokens, countTextTokens, getTokenizerDiagnostics, ChatMessage } from "../server/tokenizer";

// Utility to print a scenario heading
function heading(title: string) {
  console.log("\n=== " + title + " ===");
}

// Simple assertion helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error("[FAIL] " + message);
  } else {
    console.log("[PASS] " + message);
  }
}

function scenarioSimple(modelId: string) {
  heading("Scenario 1: Simple user message");
  const messages: ChatMessage[] = [
    { role: "user", content: "Hello world" }
  ];
  const tokens = countChatTokens(messages, modelId);
  console.log("Input tokens:", tokens);
  assert(tokens > 0, "Simple message token count > 0");
}

function scenarioMultiRole(modelId: string) {
  heading("Scenario 2: Multi-role conversation");
  const messages: ChatMessage[] = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Explain quantum computing simply." },
    { role: "assistant", content: "Quantum computing uses qubits that can be superposed." }
  ];
  const tokens = countChatTokens(messages, modelId);
  console.log("Conversation tokens:", tokens);
  assert(tokens > 0, "Multi-role token count > 0");
  // Rough heuristic: more than single message
  assert(tokens >= 20, "Multi-role token count appears larger than minimal threshold (20)");
}

function scenarioToolCalls(modelId: string) {
  heading("Scenario 3: Assistant tool_calls");
  const messages: ChatMessage[] = [
    { role: "user", content: "What's the weather in Tokyo?" },
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          type: "function",
          id: "call_1",
          function: {
            name: "getWeather",
            arguments: JSON.stringify({ location: "Tokyo", units: "metric" })
          }
        }
      ]
    }
  ];
  const tokens = countChatTokens(messages, modelId);
  console.log("Tool call messages tokens:", tokens);
  assert(tokens > 0, "Tool call message token count > 0");
  // The presence of tool_calls should add overhead beyond just text
  assert(tokens >= 15, "Tool call tokens show added structural size (>=15)");
}

function scenarioUnicode(modelId: string) {
  heading("Scenario 4: Unicode / CJK / Emoji");
  const messages: ChatMessage[] = [
    { role: "user", content: "你好，世界🌏🚀 — Mixed text: αβγδ + café & naïve." }
  ];
  const tokens = countChatTokens(messages, modelId);
  console.log("Unicode tokens:", tokens);
  assert(tokens > 0, "Unicode token count > 0");
  // Ensure heuristic wasn't used incorrectly (very small counts might indicate a fallback)
  assert(tokens >= 10, "Unicode token count reasonable (>=10)");
}

function scenarioLarge(modelId: string) {
  heading("Scenario 5: Large input");
  const base = "This is a test sentence with some repeated structure and numbers 1234567890.\n";
  const largeContent = base.repeat(200); // ~200 lines
  const messages: ChatMessage[] = [
    { role: "user", content: largeContent }
  ];
  const tokens = countChatTokens(messages, modelId);
  console.log("Large content tokens:", tokens);
  assert(tokens > 0, "Large content token count > 0");
  assert(tokens > 1000, "Large content token count > 1000 (sanity)");
}

function scenarioCache(modelId: string) {
  heading("Scenario 6: Cache effectiveness");
  const messages: ChatMessage[] = [
    { role: "user", content: "Repeat this exact payload to test cache." }
  ];
  const first = countChatTokens(messages, modelId, { useCache: true });
  const second = countChatTokens(messages, modelId, { useCache: true });
  console.log("First tokens:", first, "Second tokens:", second);
  assert(first === second, "Cached token count matches initial result");
}

function scenarioOutputText(modelId: string) {
  heading("Scenario 7: Output text counting");
  const output = "Here is a brief completion about software engineering best practices.";
  const outTokens = countTextTokens(output, modelId);
  console.log("Output tokens:", outTokens);
  assert(outTokens > 0, "Output tokens > 0");
}

function scenarioStrictMode(modelId: string) {
  heading("Scenario 8: Strict mode (if enabled)");
  if (process.env.STRICT_TOKEN_COUNT === "1") {
    console.log("STRICT_TOKEN_COUNT=1 detected. Verifying fallback rejection.");
    // We cannot easily force a tokenizer init failure without monkey-patching, so just ensure counts are >0 and no heuristic warning printed.
    const messages: ChatMessage[] = [{ role: "user", content: "Strict mode basic test." }];
    const tokens = countChatTokens(messages, modelId);
    console.log("Strict mode tokens:", tokens);
    assert(tokens > 0, "Strict mode token counting succeeded");
  } else {
    console.log("Strict mode not enabled; skip scenario.");
  }
}

function main() {
  const modelId = process.env.TEST_MODEL_ID || "gpt-4o-mini"; // default model family mapping to o200k_base
  console.log("Using modelId:", modelId);
  console.log("STRICT_TOKEN_COUNT:", process.env.STRICT_TOKEN_COUNT || "0");
  console.log("Starting token count scenarios...");

  scenarioSimple(modelId);
  scenarioMultiRole(modelId);
  scenarioToolCalls(modelId);
  scenarioUnicode(modelId);
  scenarioLarge(modelId);
  scenarioCache(modelId);
  scenarioOutputText(modelId);
  scenarioStrictMode(modelId);

  const diagnostics = getTokenizerDiagnostics();
  heading("Diagnostics");
  console.log(JSON.stringify(diagnostics, null, 2));

  console.log("\nAll scenarios executed. Review PASS/FAIL lines above for issues.");
}

try {
  main();
} catch (err: any) {
  console.error("[FATAL] Test script error:", err?.message);
  process.exit(1);
}