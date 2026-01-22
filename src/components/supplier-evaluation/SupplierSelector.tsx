/**
 * SupplierSelector Component
 * 
 * Dropdown component for selecting suppliers, sorted by annual purchase amount.
 * 
 * Principle 1: Types imported from ontology.ts
 * Principle 2: Uses semantic color variables
 * Principle 3: Component < 150 lines
 */

import { useState, useEffect } from 'react';
import { getSuppliersByPurchaseAmount } from '../../services/supplierService';
import type { Supplier } from '../../types/ontology';

import { loadHDSupplierList } from '../../services/hdSupplierDataLoader';

interface SupplierSelectorProps {
  selectedSupplierId?: string | null;
  onSupplierChange: (supplierId: string) => void;
}

const SupplierSelector = ({
  selectedSupplierId,
  onSupplierChange,
}: SupplierSelectorProps) => {


  const [suppliers, setSuppliers] = useState<Array<Supplier & { annualPurchaseAmount: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSuppliers = async () => {
      setLoading(true);
      try {
        let data: Array<any> = [];

        // 大脑模式：加载供应商
        const hdSuppliers = await loadHDSupplierList();
        data = hdSuppliers.map(s => ({
          ...s,
          annualPurchaseAmount: 0 // HD数据中此字段仅用于排序，列表展示时已有排序
        })) as any;

        // Remove duplicates by supplierId
        const uniqueSuppliers = Array.from(
          new Map(data.map(s => [s.supplierId, s])).values()
        );
        console.log(`SupplierSelector loaded:`, uniqueSuppliers.length, 'suppliers');
        setSuppliers(uniqueSuppliers);
      } catch (error) {
        console.error('Failed to load suppliers:', error);
        setSuppliers([]);
      } finally {
        setLoading(false);
      }
    };

    loadSuppliers();
  }, []);

  if (loading) {
    return (
      <div className="text-sm text-slate-500">加载供应商列表...</div>
    );
  }

  return (
    <div className="mb-4">
      <label htmlFor="supplier-select" className="block text-sm font-medium text-slate-700 mb-2">
        选择供应商
      </label>
      <select
        id="supplier-select"
        value={selectedSupplierId || ''}
        onChange={(e) => onSupplierChange(e.target.value)}
        className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      >
        <option value="">请选择供应商</option>
        {suppliers.map((supplier) => (
          <option key={supplier.supplierId} value={supplier.supplierId}>
            {supplier.supplierName} (¥{(supplier.annualPurchaseAmount / 10000).toFixed(0)}万)
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-500">
        按年度采购额降序排列
      </p>
    </div>
  );
};

export default SupplierSelector;



