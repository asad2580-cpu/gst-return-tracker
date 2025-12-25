import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// client/src/lib/queryClient.ts  (or wherever your apiRequest lives)
// client/src/lib/queryClient.ts  (or wherever your apiRequest lives)
export async function apiRequest(method: string, path: string, body?: any) {
  // ensure path starts with /api
  const apiPath = path.startsWith("/api") ? path : `/api${path.startsWith("/") ? path : "/" + path}`;

  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  // attach access token if available
  try {
    const token = localStorage.getItem("accessToken");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } catch (e) {
    // ignore localStorage errors in some environments
  }

  const res = await fetch(apiPath, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // read raw text first
  const text = await res.text();
  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    // server returned an error — include body (HTML or JSON) in the Error message
    const message = text || res.statusText || `HTTP ${res.status}`;
    throw new Error(message);
  }

  // If response is JSON, parse and return it
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error("Invalid JSON response from server");
    }
  }

  // Otherwise return raw text (useful for debugging)
  return text;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = localStorage.getItem("accessToken");
    
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // FIX: Ensure the path is clean and doesn't have double slashes
    const rawPath = queryKey.join("/");
    const cleanPath = rawPath.startsWith("//") ? rawPath.substring(1) : rawPath;

    const res = await fetch(cleanPath, {
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      // Clear potentially expired token
      localStorage.removeItem("accessToken");
      return null;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }

    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
