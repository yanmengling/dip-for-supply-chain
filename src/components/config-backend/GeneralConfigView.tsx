/**
 * General Config View
 *
 * UI for managing navigation section visibility.
 * Each section can be enabled or disabled.
 */

import { useState, useEffect } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Switch, Input } from 'antd';
import { navigationConfigService } from '../../services/navigationConfigService';
import type { NavigationConfig, NavigationSectionConfig } from '../../types/navigationConfig';
import { DEFAULT_NAVIGATION_SECTIONS } from '../../types/navigationConfig';

const GeneralConfigView = () => {
  const [config, setConfig] = useState<NavigationConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = () => {
    const loaded = navigationConfigService.loadConfig();
    setConfig(loaded);
  };

  const handleToggle = (sectionId: string, enabled: boolean) => {
    if (!config) return;
    setConfig({
      ...config,
      sections: config.sections.map((s) =>
        s.id === sectionId ? { ...s, enabled } : s
      ),
    });
  };

  const handleLabelChange = (sectionId: string, label: string) => {
    if (!config) return;
    const defaultLabel = DEFAULT_NAVIGATION_SECTIONS.find((d) => d.id === sectionId)?.label ?? '';
    setConfig({
      ...config,
      sections: config.sections.map((s) =>
        s.id === sectionId ? { ...s, label: label.trim() || defaultLabel } : s
      ),
    });
  };

  const handleSave = () => {
    if (!config) return;

    const enabledCount = config.sections.filter((s) => s.enabled).length;
    if (enabledCount === 0) {
      setSaveMessage('至少需要保留一个板块开启');
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    setIsSaving(true);
    try {
      navigationConfigService.saveConfig(config);
      setSaveMessage('保存成功！导航板块配置已更新');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      setSaveMessage('保存失败: ' + (error instanceof Error ? error.message : '未知错误'));
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  if (!config) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* 可滚动区域 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-4xl mx-auto p-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-800 mb-2">综合配置</h1>
            <p className="text-slate-600">管理应用导航板块的显示、隐藏与名称</p>
          </div>

          {/* Save Message */}
          {saveMessage && (
            <div
              className={`mb-4 px-4 py-2 rounded-lg text-sm ${
                saveMessage.includes('失败') || saveMessage.includes('至少')
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {saveMessage}
            </div>
          )}

          {/* Tab 区域：导航板块列表（非卡片） */}
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50">
            {config.sections.map((section: NavigationSectionConfig, index: number) => (
              <div
                key={section.id}
                className={`flex items-center gap-4 px-4 py-3 ${
                  index > 0 ? 'border-t border-slate-200' : ''
                } hover:bg-slate-100/50 transition-colors`}
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <Input
                    value={section.label}
                    onChange={(e) => handleLabelChange(section.id, e.target.value)}
                    placeholder="板块名称"
                    className="font-medium max-w-[200px]"
                    allowClear
                  />
                  <div className="text-sm text-slate-500">{section.description}</div>
                </div>
                <Switch
                  checked={section.enabled}
                  onChange={(checked) => handleToggle(section.id, checked)}
                  className="flex-shrink-0"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 底部操作栏（固定可见） */}
      <div className="flex-shrink-0 border-t border-slate-200 bg-white px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <Save size={18} />
            )}
            <span>保存</span>
          </button>
          <span className="text-sm text-slate-500">
            已开启 {config.sections.filter((s) => s.enabled).length} / {config.sections.length} 个板块
          </span>
        </div>
      </div>
    </div>
  );
};

export default GeneralConfigView;
