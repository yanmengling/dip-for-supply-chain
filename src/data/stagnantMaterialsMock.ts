/**
 * 呆滞物料占位文件
 * 
 * 此文件仅作为占位符，导出空数据和空函数
 * 实际数据需要通过 API 获取
 */

export interface StagnantMaterialMockData {
    isStagnant: boolean;
    storageDays: number;
    currentStock: number;
}

/**
 * 呆滞物料数据映射（空）
 * @deprecated 请使用真实 API 数据
 */
export const stagnantMaterialsMock: Record<string, StagnantMaterialMockData> = {};

/**
 * 获取物料的呆滞信息
 * @deprecated 请使用真实 API 数据
 */
export function getStagnantInfo(_materialCode: string): StagnantMaterialMockData | null {
    return null;
}

/**
 * 检查物料是否呆滞
 * @deprecated 请使用真实 API 数据
 */
export function isStagnantMaterial(_materialCode: string): boolean {
    return false;
}

/**
 * 获取所有呆滞物料编码
 * @deprecated 请使用真实 API 数据
 */
export function getAllStagnantMaterialCodes(): string[] {
    return [];
}

/**
 * 获取呆滞物料总数
 * @deprecated 请使用真实 API 数据
 */
export function getStagnantMaterialCount(): number {
    return 0;
}
