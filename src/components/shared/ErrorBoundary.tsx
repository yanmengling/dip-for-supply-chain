import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    name?: string;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error(`[ErrorBoundary] Error in ${this.props.name || 'Component'}:`, error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="p-4 bg-red-50 border border-red-100 rounded-lg flex flex-col items-center justify-center min-h-[100px] text-red-600">
                    <AlertTriangle size={24} className="mb-2" />
                    <div className="text-sm font-semibold">{this.props.name || 'Component'} Error</div>
                    <div className="text-xs text-red-400 mt-1 max-w-full truncate">
                        {this.state.error?.message}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
