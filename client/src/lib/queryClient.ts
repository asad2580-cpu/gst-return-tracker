import { QueryClient, QueryFunction } from "@tanstack/react-query";

// 1. API Request Helper (for Mutations like Login/Post)
export async function apiRequest(method: string, path: string, body?: any) {
  const apiPath = path.startsWith("/api") ? path : `/api${path.startsWith("/") ? path : "/" + path}`;
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  // SURGERY: Always use sessionStorage for Fintech-grade tab-isolation
  const token = sessionStorage.getItem("accessToken");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(apiPath, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || res.statusText || `HTTP ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return JSON.parse(text);
  }
  return text;
}

// 2. Query Function Helper (for fetching data like /api/auth/me)
type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // SURGERY: Must match sessionStorage here as well!
    const token = sessionStorage.getItem("accessToken");
    
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const rawPath = queryKey.join("/");
    const cleanPath = rawPath.startsWith("//") ? rawPath.substring(1) : rawPath;

    const res = await fetch(cleanPath, { headers });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      // If unauthorized, wipe the session
      sessionStorage.removeItem("accessToken");
      return null;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }

    return await res.json();
  };

// 3. Global Query Client Configuration
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 0, // Fintech: always verify fresh data on refresh
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});