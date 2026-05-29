// Global API Client with auto header bindings

const BASE_URL = ""; // Relative url since they share domain in Full-Stack mode

export class ApiClient {
  private static getToken(): string | null {
    return localStorage.getItem("nb_orchestrator_token");
  }

  static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers = new Headers(options.headers || {});
    
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    
    if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    const config: RequestInit = {
      ...options,
      headers,
    };

    const response = await fetch(`${BASE_URL}${endpoint}`, config);

    if (!response.ok) {
      let errorMsg = `Server response failed with status ${response.status}`;
      try {
        const body = await response.json();
        errorMsg = body.error || errorMsg;
      } catch {
        // use fallback status
      }
      throw new Error(errorMsg);
    }

    // Handle empty payloads gracefully
    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  static get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  static post<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  static put<T>(endpoint: string, body: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  static delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }
}
