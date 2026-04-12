/**
 * useFileContent Hook
 *
 * Fetches and caches file content from workspace for viewing.
 * Uses request IDs to prevent stale responses from race conditions.
 */

import { useState, useCallback, useRef } from 'react';
import type { FileContentResponse } from '../types';
import { debugLog } from '../utils/debugLogger';
import { normalizePath } from '../utils/normalizePath';
import { useWorkspaceStore } from '../stores/workspaceStore';

interface UseFileContentReturn {
  content: FileContentResponse | null;
  isLoading: boolean;
  error: string | null;
  fetchFile: (filePath: string, workspacePath: string, skipCache?: boolean) => Promise<void>;
  clearContent: () => void;
}

// Simple in-memory cache for file contents
const fileCache = new Map<string, FileContentResponse>();
// Track files that returned 404 to avoid repeated fetches
const notFoundCache = new Set<string>();

export function useFileContent(): UseFileContentReturn {
  const [content, setContent] = useState<FileContentResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track current request to prevent stale responses from updating state
  const requestIdRef = useRef(0);
  // Track abort controller to cancel in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchFile = useCallback(async (filePath: string, workspacePath: string, skipCache = false) => {
    // Normalize workspace path for consistent cache keys and API requests
    // This fixes the 404 bug where paths with trailing slashes cause mismatches
    const normalizedWorkspacePath = normalizePath(workspacePath);
    const cacheKey = `${normalizedWorkspacePath}:${filePath}`;
    const workspaceState = useWorkspaceStore.getState();
    const isLiveWorkspace = !!workspaceState.workspaces[normalizedWorkspacePath];

    // Increment request ID and capture it for this request
    const thisRequestId = ++requestIdRef.current;

    debugLog.info('[FileContent] fetchFile called', { filePath, workspacePath, normalizedWorkspacePath, skipCache, requestId: thisRequestId });

    // Check cache first (unless skipping)
    if (!skipCache) {
      const cached = fileCache.get(cacheKey);
      if (cached) {
        debugLog.info('[FileContent] cache hit', { filePath, workspacePath, requestId: thisRequestId });
        setContent(cached);
        setError(null);
        return;
      }
      // Check if file was not found recently (avoid repeated 404s)
      if (notFoundCache.has(cacheKey)) {
        debugLog.info('[FileContent] notFound cache hit', { filePath, workspacePath, requestId: thisRequestId });
        setError('File not found');
        setContent(null);
        return;
      }
    } else {
      fileCache.delete(cacheKey);
      notFoundCache.delete(cacheKey);
    }

    // Cancel any in-flight request before starting a new one
    if (abortControllerRef.current) {
      debugLog.info('[FileContent] aborting previous request', { requestId: thisRequestId });
      abortControllerRef.current.abort();
    }

    setIsLoading(true);
    setError(null);

    // Create new abort controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const params = new URLSearchParams({
        path: filePath,
        workspace: normalizedWorkspacePath,
      });

      debugLog.info('[FileContent] fetching', { url: `/api/workspace/file?${params}`, requestId: thisRequestId });
      const response = await fetch(`/api/workspace/file?${params}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Check if this request is still current (prevent stale response from updating state)
      if (thisRequestId !== requestIdRef.current) {
        debugLog.info('[FileContent] stale response ignored', { filePath, requestId: thisRequestId, currentId: requestIdRef.current });
        return;
      }

      // FIX: Check response.ok BEFORE calling .json() to handle non-JSON error responses
      if (!response.ok) {
        debugLog.error('[FileContent] fetch failed', { status: response.status, requestId: thisRequestId });
        // Cache 404s to avoid repeated fetches
        if (response.status === 404) {
          if (isLiveWorkspace) {
            workspaceState.refreshSessionFn?.();
          } else {
            notFoundCache.add(cacheKey);
          }
        }
        // Try to get error message from response
        let errorMessage = `Failed to fetch file: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // Response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data: FileContentResponse = await response.json();

      // Check for error field in response (can happen even with 200 status)
      if (data.error) {
        debugLog.error('[FileContent] response has error field', { filePath, error: data.error, requestId: thisRequestId });
        throw new Error(data.error);
      }

      debugLog.info('[FileContent] fetch success', {
        filePath,
        contentLength: data.content?.length ?? 0,
        binary: data.binary,
        mimeType: data.mimeType,
        hasContent: !!data.content,
        requestId: thisRequestId,
      });
      // Cache the result and clear any previous 404 cache
      fileCache.set(cacheKey, data);
      notFoundCache.delete(cacheKey);

      // Double-check this request is still current before setting state
      if (thisRequestId === requestIdRef.current) {
        setContent(data);
        abortControllerRef.current = null;
      }
    } catch (err) {
      clearTimeout(timeoutId);

      // For AbortErrors, check if it was a user-initiated abort (new request started)
      // vs a timeout abort. User-initiated aborts should be silently ignored.
      if (err instanceof Error && err.name === 'AbortError') {
        // If this request is no longer current, it was aborted by a new request - ignore silently
        if (thisRequestId !== requestIdRef.current) {
          debugLog.info('[FileContent] request aborted by newer request', { filePath, requestId: thisRequestId });
          return;
        }
        // Otherwise it was a timeout - show error
        debugLog.error('[FileContent] timeout', { filePath, workspacePath, requestId: thisRequestId });
        setError('Request timed out. Try again.');
        setContent(null);
        abortControllerRef.current = null;
        return;
      }

      // For non-abort errors, check if this request is still current
      if (thisRequestId !== requestIdRef.current) {
        debugLog.info('[FileContent] stale error ignored', { filePath, requestId: thisRequestId });
        return;
      }

      debugLog.error('[FileContent] error', { filePath, workspacePath, error: err instanceof Error ? err.message : String(err), requestId: thisRequestId });
      setError(err instanceof Error ? err.message : 'Failed to load file');
      setContent(null);
      abortControllerRef.current = null;
    } finally {
      // Only clear loading if this is still the current request
      if (thisRequestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const clearContent = useCallback(() => {
    setContent(null);
    setError(null);
  }, []);

  return {
    content,
    isLoading,
    error,
    fetchFile,
    clearContent,
  };
}

// Clear cache (useful for testing or when workspaces change)
export function clearFileCache(): void {
  fileCache.clear();
  notFoundCache.clear();
}

// Clear 404 cache for a specific file (call when WebSocket reports file created/modified)
export function clearFileNotFound(filePath: string, workspacePath: string): void {
  // Normalize workspace path for consistent cache key lookup
  const normalizedWorkspacePath = normalizePath(workspacePath);
  const cacheKey = `${normalizedWorkspacePath}:${filePath}`;
  debugLog.info('[FileContent] clearFileNotFound', { filePath, workspacePath, cacheKey });
  notFoundCache.delete(cacheKey);
  // Also clear content cache so we fetch fresh content
  fileCache.delete(cacheKey);
}

// Clear 404 cache for all files in a workspace (call on workspace refresh or version switch)
export function clearFileNotFoundForWorkspace(workspacePath: string): void {
  const normalizedWorkspacePath = normalizePath(workspacePath);
  const prefix = `${normalizedWorkspacePath}:`;
  let clearedCount = 0;
  for (const key of notFoundCache) {
    if (key.startsWith(prefix)) {
      notFoundCache.delete(key);
      fileCache.delete(key);
      clearedCount++;
    }
  }
  if (clearedCount > 0) {
    debugLog.info('[FileContent] clearFileNotFoundForWorkspace', { workspacePath, clearedCount });
  }
}
