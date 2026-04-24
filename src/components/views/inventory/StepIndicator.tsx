/**
 * 步骤指示器组件
 * 
 * 显示三步走流程的当前进度
 */

import { Check } from 'lucide-react';
import type { OptimizerStep } from '../../../types/stagnantInventory';

interface StepIndicatorProps {
    currentStep: OptimizerStep;
}

const steps = [
    { number: 1, label: '选择呆滞物料' },
    { number: 2, label: '选择目标产品' },
    { number: 3, label: '查看方案对比' },
];

export const StepIndicator = ({ currentStep }: StepIndicatorProps) => {
    return (
        <div className="mb-8">
            <div className="flex items-center justify-between max-w-3xl mx-auto">
                {steps.map((step, index) => (
                    <div key={step.number} className="flex items-center flex-1">
                        {/* 步骤圆圈 */}
                        <div className="flex flex-col items-center">
                            <div
                                className={`
                  w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm
                  transition-all duration-200
                  ${step.number < currentStep
                                        ? 'bg-blue-600 text-white'
                                        : step.number === currentStep
                                            ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                                            : 'bg-slate-200 text-slate-500'
                                    }
                `}
                            >
                                {step.number < currentStep ? (
                                    <Check className="w-5 h-5" />
                                ) : (
                                    step.number
                                )}
                            </div>
                            <div
                                className={`
                  mt-2 text-sm font-medium whitespace-nowrap
                  ${step.number === currentStep
                                        ? 'text-blue-600'
                                        : step.number < currentStep
                                            ? 'text-slate-700'
                                            : 'text-slate-400'
                                    }
                `}
                            >
                                {step.label}
                            </div>
                        </div>

                        {/* 连接线 */}
                        {index < steps.length - 1 && (
                            <div className="flex-1 h-0.5 mx-4 bg-slate-200">
                                <div
                                    className={`
                    h-full transition-all duration-300
                    ${step.number < currentStep ? 'bg-blue-600' : 'bg-transparent'}
                  `}
                                    style={{ width: step.number < currentStep ? '100%' : '0%' }}
                                />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
