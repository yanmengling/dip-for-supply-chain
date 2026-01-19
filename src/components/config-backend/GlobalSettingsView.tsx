/**
 * Global Settings View
 * 
 * UI for managing global application settings including API Token.
 */

import { useState, useEffect } from 'react';
import { Save, Eye, EyeOff, RotateCcw, CheckCircle, XCircle, Loader2, Key } from 'lucide-react';
import { globalSettingsService } from '../../services/globalSettingsService';
import type { GlobalSettings } from '../../types/globalSettings';

const GlobalSettingsView = () => {
    // const { mode, setMode, isApiMode } = useDataMode(); // Removed mode switching, strictly API mode now
    const [settings, setSettings] = useState<GlobalSettings | null>(null);
    const [editedToken, setEditedToken] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [showToken, setShowToken] = useState(false);

    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);

    // Load settings on mount
    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = () => {
        const loaded = globalSettingsService.loadSettings();
        setSettings(loaded);
        setEditedToken(loaded.apiToken);
    };

    const handleSave = async () => {
        if (!settings) return;

        // Validate
        const errors = globalSettingsService.validateSettings({ apiToken: editedToken });
        if (errors.length > 0) {
            setSaveMessage(errors[0].message);
            setTimeout(() => setSaveMessage(null), 3000);
            return;
        }

        setIsSaving(true);
        try {
            const updated: GlobalSettings = {
                ...settings,
                apiToken: editedToken
            };
            globalSettingsService.saveSettings(updated);

            // Sync to runtime configuration immediately
            import('../../config/apiConfig').then(({ updateApiConfig }) => {
                updateApiConfig({
                    auth: {
                        token: editedToken,
                        tokenType: 'Bearer'
                    }
                });
            });

            setSettings(updated);
            setIsEditing(false);
            setSaveMessage('保存成功！');
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (error) {
            setSaveMessage('保存失败: ' + (error instanceof Error ? error.message : '未知错误'));
            setTimeout(() => setSaveMessage(null), 3000);
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        if (confirm('确定要重置为默认设置吗？这将恢复默认的 API Token。')) {
            globalSettingsService.resetToDefaults();
            loadSettings();
            setIsEditing(false);
            setSaveMessage('已重置为默认设置');
            setTimeout(() => setSaveMessage(null), 3000);
        }
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const result = await globalSettingsService.testConnection();
            setTestResult(result);
        } catch (error) {
            setTestResult({
                success: false,
                message: error instanceof Error ? error.message : '测试失败'
            });
        } finally {
            setIsTesting(false);
        }
    };

    const maskToken = (token: string) => {
        if (token.length <= 20) return '***';
        return token.substring(0, 10) + '***' + token.substring(token.length - 10);
    };

    if (!settings) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="animate-spin text-indigo-600" size={32} />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-800 mb-2">全局设置</h1>
                <p className="text-slate-600">管理应用程序的全局配置参数</p>
            </div>

            {/* Save Message */}
            {saveMessage && (
                <div className={`mb-4 p-3 rounded-lg ${saveMessage.includes('成功') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}>
                    {saveMessage}
                </div>
            )}

            {/* API Authentication Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                        <Key className="text-indigo-600" size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-slate-800">API 认证配置</h2>
                        <p className="text-sm text-slate-500">配置全局 API 访问令牌</p>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* API Token */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            API Token
                        </label>
                        {isEditing ? (
                            <div className="flex gap-2">
                                <input
                                    type={showToken ? 'text' : 'password'}
                                    value={editedToken}
                                    onChange={(e) => setEditedToken(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                                    placeholder="输入 API Token"
                                />
                                <button
                                    onClick={() => setShowToken(!showToken)}
                                    className="px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                                    title={showToken ? '隐藏' : '显示'}
                                >
                                    {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <code className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-sm text-slate-700">
                                    {showToken ? settings.apiToken : maskToken(settings.apiToken)}
                                </code>
                                <button
                                    onClick={() => setShowToken(!showToken)}
                                    className="px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                                    title={showToken ? '隐藏' : '显示'}
                                >
                                    {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                                >
                                    编辑
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Last Updated */}
                    <div className="text-sm text-slate-500">
                        最后更新: {new Date(settings.lastUpdated).toLocaleString('zh-CN')}
                    </div>

                    {/* Action Buttons */}
                    {isEditing && (
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    <Save size={16} />
                                )}
                                保存
                            </button>
                            <button
                                onClick={() => {
                                    setIsEditing(false);
                                    setEditedToken(settings.apiToken);
                                }}
                                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                            >
                                取消
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Test Connection Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">连接测试</h3>

                <button
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                >
                    {isTesting ? (
                        <Loader2 size={16} className="animate-spin" />
                    ) : (
                        <CheckCircle size={16} />
                    )}
                    {isTesting ? '测试中...' : '测试 API 连接'}
                </button>

                {testResult && (
                    <div className={`flex items-start gap-3 p-4 rounded-lg ${testResult.success
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-red-50 border border-red-200'
                        }`}>
                        {testResult.success ? (
                            <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
                        ) : (
                            <XCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                        )}
                        <div>
                            <p className={`font-medium ${testResult.success ? 'text-green-800' : 'text-red-800'
                                }`}>
                                {testResult.message}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Reset Section */}
            <div className="mt-6 pt-6 border-t border-slate-200">
                <button
                    onClick={handleReset}
                    className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                    <RotateCcw size={16} />
                    重置为默认设置
                </button>
                <p className="text-sm text-slate-500 mt-2">
                    这将恢复所有设置为默认值，包括 API Token
                </p>
            </div>
        </div>
    );
};

export default GlobalSettingsView;
