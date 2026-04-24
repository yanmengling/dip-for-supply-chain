/**
 * Error Handler Hook
 *
 * Provides centralized error handling for API calls and user interactions
 */

import { useState, useCallback } from 'react';

export interface AppError {
  code: string;
  message: string;
  details?: string;
  isNetworkError?: boolean;
  retryable?: boolean;
}

export interface UseErrorHandlerReturn {
  error: AppError | null;
  isRetrying: boolean;
  setError: (error: AppError | Error | string | null) => void;
  clearError: () => void;
  handleError: (error: any, context?: string) => AppError;
  retry: (retryFn: () => Promise<void>) => Promise<void>;
}

export const useErrorHandler = (): UseErrorHandlerReturn => {
  const [error, setErrorState] = useState<AppError | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const parseError = useCallback((error: any): AppError => {
    if (!error) {
      return {
        code: 'UNKNOWN_ERROR',
        message: '未知错误',
        retryable: false
      };
    }

    // Handle custom API errors
    if (error.code && error.message) {
      return {
        code: error.code,
        message: error.message,
        details: error.details,
        isNetworkError: error.isNetworkError || false,
        retryable: isRetryableError(error.code, error.status)
      };
    }

    // Handle standard Error objects
    if (error instanceof Error) {
      return {
        code: 'GENERIC_ERROR',
        message: error.message,
        isNetworkError: false,
        retryable: false
      };
    }

    // Handle string errors
    if (typeof error === 'string') {
      return {
        code: 'STRING_ERROR',
        message: error,
        retryable: false
      };
    }

    // Handle unknown error types
    return {
      code: 'UNKNOWN_ERROR',
      message: '发生未知错误',
      details: String(error),
      retryable: false
    };
  }, []);

  const setError = useCallback((error: AppError | Error | string | null) => {
    if (!error) {
      setErrorState(null);
      return;
    }

    const parsedError = parseError(error);
    setErrorState(parsedError);

    // Log error for debugging
    console.error('Application Error:', parsedError);
  }, [parseError]);

  const clearError = useCallback(() => {
    setErrorState(null);
  }, []);

  const handleError = useCallback((error: any, context?: string): AppError => {
    const parsedError = parseError(error);

    if (context) {
      parsedError.details = `${context}: ${parsedError.details || parsedError.message}`;
    }

    setErrorState(parsedError);
    return parsedError;
  }, [parseError]);

  const retry = useCallback(async (retryFn: () => Promise<void>) => {
    if (!error?.retryable || isRetrying) {
      return;
    }

    setIsRetrying(true);
    clearError();

    try {
      await retryFn();
    } catch (retryError) {
      handleError(retryError, '重试失败');
    } finally {
      setIsRetrying(false);
    }
  }, [error?.retryable, isRetrying, clearError, handleError]);

  return {
    error,
    isRetrying,
    setError,
    clearError,
    handleError,
    retry
  };
};

/**
 * Determine if an error is retryable based on error code and status
 */
function isRetryableError(code: string, status?: number): boolean {
  // Network errors are generally retryable
  if (status && status >= 500) {
    return true;
  }

  // Specific error codes that are retryable
  const retryableCodes = [
    'NETWORK_ERROR',
    'CONNECTION_ERROR',
    'TIMEOUT_ERROR',
    'AgentAPP_InternalError',
    'AgentAPP_Agent_CallAgentExecutorFailed'
  ];

  return retryableCodes.includes(code);
}

/**
 * Error message translations for user-friendly display
 */
export const getErrorMessage = (error: AppError): string => {
  const translations: Record<string, string> = {
    'NETWORK_ERROR': '网络连接失败，请检查网络连接后重试',
    'CONNECTION_ERROR': '无法连接到服务器，请稍后重试',
    'REQUEST_ABORTED': '请求已取消',
    'AgentAPP_Agent_GetAgentFailed': '获取助手配置失败，请稍后重试',
    'AgentAPP_Agent_CallAgentExecutorFailed': '助手处理请求失败，请重试',
    'AgentAPP_Forbidden_PermissionDenied': '权限不足，请联系管理员',
    'AgentAPP_InternalError': '服务器内部错误，请稍后重试',
    'AgentAPP_Agent_CreateConversationFailed': '创建对话失败，请重试',
    'TIMEOUT_ERROR': '请求超时，请检查网络连接后重试',
    'UNKNOWN_ERROR': '发生未知错误，请稍后重试'
  };

  return translations[error.code] || error.message;
};