import { ModelProviderCard } from "../ModelProviderCard";

export default function ModelProviderCardExample() {
  return (
    <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ModelProviderCard
        provider="GPT"
        color="bg-emerald-600"
        models={[
          "gpt-5-high",
          "chatgpt-4o-latest-20250326",
          "gpt-5-chat",
          "gpt-4.1-2025-04-14"
        ]}
      />
      <ModelProviderCard
        provider="Claude"
        color="bg-purple-600"
        models={[
          "claude-opus-4-1-20250805-thinkin...",
          "claude-sonnet-4-5-20250929-thinki...",
          "claude-sonnet-4-5-20250929",
          "claude-opus-4-1-20250805"
        ]}
      />
    </div>
  );
}
