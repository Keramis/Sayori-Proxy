// API utility functions for Sayori Proxy

export const api = {
  // Stats
  getStats: () => fetch("/api/stats").then((res) => res.json()),

  // Public providers
  getPublicProviders: () => fetch("/api/providers/public").then((res) => res.json()),

  // Token stats
  getTokenStats: (token: string) =>
    fetch("/api/token/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then((res) => res.json()),

  // Admin login
  adminLogin: (username: string, password: string) =>
    fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then((res) => res.json()),

  // Admin - Providers
  getProviders: (authToken: string) =>
    fetch("/api/admin/providers", {
      headers: { Authorization: authToken },
    }).then((res) => res.json()),

  createProvider: (authToken: string, data: any) =>
    fetch("/api/admin/providers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken,
      },
      body: JSON.stringify(data),
    }).then((res) => res.json()),

  updateProvider: (authToken: string, id: string, data: any) =>
    fetch(`/api/admin/providers/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken,
      },
      body: JSON.stringify(data),
    }).then((res) => res.json()),

  deleteProvider: (authToken: string, id: string) =>
    fetch(`/api/admin/providers/${id}`, {
      method: "DELETE",
      headers: { Authorization: authToken },
    }).then((res) => res.json()),

  // Admin - API Keys
  getProviderKeys: (authToken: string, providerId: string) =>
    fetch(`/api/admin/providers/${providerId}/keys`, {
      headers: { Authorization: authToken },
    }).then((res) => res.json()),

  addProviderKey: (authToken: string, providerId: string, key: string) =>
    fetch(`/api/admin/providers/${providerId}/keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken,
      },
      body: JSON.stringify({ key }),
    }).then((res) => res.json()),

  deleteKey: (authToken: string, keyId: string) =>
    fetch(`/api/admin/keys/${keyId}`, {
      method: "DELETE",
      headers: { Authorization: authToken },
    }).then((res) => res.json()),

  updateApiKey: (authToken: string, keyId: string, key: string) =>
    fetch(`/api/admin/keys/${keyId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken,
      },
      body: JSON.stringify({ key }),
    }).then((res) => res.json()),

  // Admin - Models
  checkProviderModels: (authToken: string, providerId: string) =>
    fetch(`/api/admin/providers/${providerId}/check-models`, {
      method: "POST",
      headers: { Authorization: authToken },
    }).then((res) => res.json()),

  getProviderModels: (authToken: string, providerId: string) =>
    fetch(`/api/admin/providers/${providerId}/models`, {
      headers: { Authorization: authToken },
    }).then((res) => res.json()),

  updateModel: (authToken: string, modelId: string, data: any) =>
    fetch(`/api/admin/models/${modelId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken,
      },
      body: JSON.stringify(data),
    }).then((res) => res.json()),

  enableAllModels: (authToken: string, providerId: string) =>
    fetch(`/api/admin/providers/${providerId}/models/enable-all`, {
      method: "POST",
      headers: { Authorization: authToken },
    }).then((res) => res.json()),

  disableAllModels: (authToken: string, providerId: string) =>
    fetch(`/api/admin/providers/${providerId}/models/disable-all`, {
      method: "POST",
      headers: {
        Authorization: authToken,
      },
    }).then((res) => res.json()),

  async updateAllModelsCost(authToken: string, providerId: string, requestCost: number) {
    const response = await fetch(`${API_URL}/api/admin/providers/${providerId}/models/update-cost-all`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken,
      },
      body: JSON.stringify({ requestCost }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update model costs");
    }
    return response.json();
  },

  // Admin - User Tokens
  getUserTokens: (authToken: string) =>
    fetch("/api/admin/tokens", {
      headers: { Authorization: authToken },
    }).then((res) => res.json()),

  createUserToken: (authToken: string, data: any) =>
    fetch("/api/admin/tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken,
      },
      body: JSON.stringify(data),
    }).then((res) => res.json()),

  deleteUserToken: (authToken: string, tokenId: string) =>
    fetch(`/api/admin/tokens/${tokenId}`, {
      method: "DELETE",
      headers: { Authorization: authToken },
    }).then((res) => res.json()),
};