/**
 * Data Mode Context
 * 
 * 提供全局数据模式管理：
 * - 惠达供应链大脑模式：对接新的惠达数据 API
 */

import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { setCurrentEnvironment } from '../config/apiConfig';

// ============================================================================
// Types
// ============================================================================

export type DataMode = 'api';

interface DataModeContextType {
    mode: DataMode;
    setMode: (mode: DataMode) => void;
    isApiMode: boolean;
    isMockMode: boolean;
}

// ============================================================================
// Context
// ============================================================================

const DataModeContext = createContext<DataModeContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface DataModeProviderProps {
    children: ReactNode;
}

const STORAGE_KEY = 'supply-chain-data-mode';

export const DataModeProvider = ({ children }: DataModeProviderProps) => {
    // Force API mode
    const [mode] = useState<DataMode>('api');

    // Always enforce huida-new environment on mount
    useEffect(() => {
        console.log(`[DataModeContext] Enforcing Brain Mode (API)`);
        setCurrentEnvironment('huida-new');
    }, []);

    // No-op setMode
    const setMode = (newMode: DataMode) => {
        console.warn('[DataModeContext] Mode switching is disabled. Always using API mode.');
    };

    const value: DataModeContextType = {
        mode,
        setMode,
        isApiMode: mode === 'api',
        isMockMode: false,
    };

    return (
        <DataModeContext.Provider value={value}>
            {children}
        </DataModeContext.Provider>
    );
};

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access and control the global data mode
 * 
 * @example
 * const { mode, setMode, isApiMode } = useDataMode();
 * 
 * // 切换到惠达供应链大脑模式（新的惠达数据 API）
 * setMode('api');
 * 
 * // 检查当前模式
 * if (isApiMode) {
 *   // 使用新的惠达数据 API
 * }
 */
export const useDataMode = (): DataModeContextType => {
    const context = useContext(DataModeContext);

    if (context === undefined) {
        throw new Error('useDataMode must be used within a DataModeProvider');
    }

    return context;
};
