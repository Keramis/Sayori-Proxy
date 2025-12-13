// API utility functions for Sayori Proxy

export const api = {
  // Stats
  getStats: () =>
    fetch("/api/stats").then(async (res) => {
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    }),

  // Public providers
  getPublicProviders: () => fetch("/api/providers/public").then((res) => res.json()),

  // Token stats
  getTokenStats: (token: string) =>
    fetch("/api/token/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch token stats");
      }
      return res.json();
    }),

  // Update token name
  updateTokenName: (token: string, name: string) =>
    fetch("/api/token/update-name", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name }),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update token name");
      }
      return res.json();
    }),

  // Get comprehensive user token management data
  getUserManageData: (token: string) =>
    fetch("/api/user/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch user data");
      }
      return res.json();
    }),

  // Create sub-key
  createSubKey: (token: string, data: { name: string; maxRPD: number; maxRPM: number; allowedProviders?: string[]; expiresAt?: number }) =>
    fetch("/api/user/sub-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...data }),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create sub-key");
      }
      return res.json();
    }),

  // Delete sub-key
  deleteSubKey: (token: string, subKeyId: string) =>
    fetch(`/api/user/sub-keys/${subKeyId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete sub-key");
      }
      return res.json();
    }),

  // Disable sub-key (cascade)
  disableSubKey: (token: string, subKeyId: string) =>
    fetch(`/api/user/sub-keys/${subKeyId}/disable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to disable sub-key");
      }
      return res.json();
    }),

  // Enable sub-key (cascade)
  enableSubKey: (token: string, subKeyId: string) =>
    fetch(`/api/user/sub-keys/${subKeyId}/enable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to enable sub-key");
      }
      return res.json();
    }),

  // Admin login
  adminLogin: (username: string, password: string) =>
    fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Login failed");
      }
      return res.json();
    }),

  // Check auth status
  checkAuth: () =>
    fetch("/api/admin/me").then(async (res) => {
      if (!res.ok) throw new Error("Not authenticated");
      return res.json();
    }),

  // Logout
  logout: () =>
    fetch("/api/admin/logout", {
      method: "POST",
    }).then(async (res) => {
      if (!res.ok) throw new Error("Logout failed");
      return res.json();
    }),

  // Admin - Providers
  getProviders: () =>
    fetch("/api/admin/providers").then(async (res) => {
      if (!res.ok) throw new Error("Failed to fetch providers");
      return res.json();
    }),

  createProvider: (data: any) =>
    fetch("/api/admin/providers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create provider");
      }
      return res.json();
    }),

  updateProvider: (id: string, data: any) =>
    fetch(`/api/admin/providers/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update provider");
      }
      return res.json();
    }),

  deleteProvider: (id: string) =>
    fetch(`/api/admin/providers/${id}`, {
      method: "DELETE",
    }).then(async (res) => {
      if (!res.ok) throw new Error("Failed to delete provider");
      return res.json();
    }),

  // Admin - API Keys
  getProviderKeys: (providerId: string) =>
    fetch(`/api/admin/providers/${providerId}/keys`).then(async (res) => {
      if (!res.ok) throw new Error("Failed to fetch provider keys");
      return res.json();
    }),

  addProviderKey: (providerId: string, key: string) =>
    fetch(`/api/admin/providers/${providerId}/keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key }),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to add provider key");
      }
      return res.json();
    }),

  deleteKey: (keyId: string) =>
    fetch(`/api/admin/keys/${keyId}`, {
      method: "DELETE",
    }).then(async (res) => {
      if (!res.ok) throw new Error("Failed to delete API key");
      return res.json();
    }),

  updateApiKey: (keyId: string, key: string) =>
    fetch(`/api/admin/keys/${keyId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key }),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update API key");
      }
      return res.json();
    }),

  // Admin - Models
  checkProviderModels: (providerId: string) =>
    fetch(`/api/admin/providers/${providerId}/check-models`, {
      method: "POST",
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to check models");
      }
      return res.json();
    }),

  getProviderModels: (providerId: string) =>
    fetch(`/api/admin/providers/${providerId}/models`).then(async (res) => {
      if (!res.ok) throw new Error("Failed to fetch provider models");
      return res.json();
    }),

  updateModel: (modelId: string, data: any) =>
    fetch(`/api/admin/models/${modelId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update model");
      }
      return res.json();
    }),

  bulkUpdateModels: (providerId: string, updates: Array<{ id: string; enabled: boolean }>) =>
    fetch(`/api/admin/providers/${providerId}/models/bulk`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ updates }),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to bulk update models");
      }
      return res.json();
    }),

  async updateAllModelsCost(providerId: string, requestCost: number) {
    const response = await fetch(`/api/admin/providers/${providerId}/models/update-cost-all`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
  getUserTokens: () =>
    fetch("/api/admin/tokens").then(async (res) => {
      if (!res.ok) throw new Error("Failed to fetch user tokens");
      return res.json();
    }),

  createUserToken: (data: any) =>
    fetch("/api/admin/tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create user token");
      }
      return res.json();
    }),

  updateUserToken: (tokenId: string, data: any) =>
    fetch(`/api/admin/tokens/${tokenId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update user token");
      }
      return res.json();
    }),

  deleteUserToken: (tokenId: string) =>
    fetch(`/api/admin/tokens/${tokenId}`, {
      method: "DELETE",
    }).then(async (res) => {
      if (!res.ok) throw new Error("Failed to delete user token");
      return res.json();
    }),
};