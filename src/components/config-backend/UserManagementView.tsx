/**
 * User Management View
 * 
 * User and role management view styled like EntityListPage (supplier object page).
 * Displays users in a table format with search, filter, and export functionality.
 */

import { useState, useMemo } from 'react';
import { Search, Download, Plus, Edit2, Trash2 } from 'lucide-react';
import { getUsers, getRoles, deleteUser } from '../../utils/entityConfigService';
import type { User } from '../../types/ontology';

const UserManagementView = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const users = useMemo(() => getUsers(), []);
  const roles = useMemo(() => getRoles(), []);
  
  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const query = searchQuery.toLowerCase();
    return users.filter((user: User) => {
      const name = user.name?.toLowerCase() || '';
      const email = user.email?.toLowerCase() || '';
      const department = user.department?.toLowerCase() || '';
      const roleName = roles.find(r => r.roleId === user.role)?.name?.toLowerCase() || '';
      return name.includes(query) || email.includes(query) || department.includes(query) || roleName.includes(query);
    });
  }, [users, searchQuery, roles]);

  const roleColorClasses: Record<string, string> = {
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    pink: 'bg-pink-100 text-pink-700 border-pink-200',
  };

  const handleDelete = (userId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const user = users.find(u => u.userId === userId);
    if (user && window.confirm(`确定要删除用户 ${user.name} 吗？`)) {
      deleteUser(userId);
    }
  };

  const handleExport = () => {
    const csvContent = [
      ['用户ID', '姓名', '邮箱', '电话', '角色', '部门', '权限范围', '状态'].join(','),
      ...filteredUsers.map(user => {
        const role = roles.find(r => r.roleId === user.role);
        return [
          user.userId,
          user.name,
          user.email,
          user.phone,
          role?.name || user.role,
          user.department,
          '-',
          user.status === 'active' ? '激活' : '停用',
        ].join(',');
      }),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `users_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="p-4 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">用户管理</h2>
            <p className="text-xs text-slate-500 mt-0.5">管理用户账号和角色权限</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:shadow-md flex items-center gap-1 transition-all"
            >
              <Download size={12}/> 导出
            </button>
            <button className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-xs font-bold hover:shadow-md flex items-center gap-1 transition-all">
              <Plus size={12}/> 添加用户
            </button>
          </div>
        </div>
        
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="搜索用户、邮箱、部门或角色..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">用户</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">角色</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">部门</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">权限范围</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">状态</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredUsers.map(user => {
                const role = roles.find(r => r.roleId === user.role);
                const roleColorClass = roleColorClasses[role?.color || 'blue'] || 'bg-blue-100 text-blue-700 border-blue-200';
                
                return (
                  <tr 
                    key={user.userId} 
                    className="border-b border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="text-xl">{user.avatar}</div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">{user.name}</div>
                          <div className="text-xs text-slate-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 ${roleColorClass} rounded-full text-xs font-bold border`}>
                        {role?.name || user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{user.department}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">-</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        user.status === 'active' 
                          ? 'bg-emerald-100 text-emerald-700' 
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {user.status === 'active' ? '激活' : '停用'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button 
                          className="p-1.5 hover:bg-blue-50 rounded transition-colors" 
                          title="编辑"
                        >
                          <Edit2 size={14} className="text-blue-600"/>
                        </button>
                        <button 
                          onClick={(e) => handleDelete(user.userId, e)}
                          className="p-1.5 hover:bg-red-50 rounded transition-colors" 
                          title="删除"
                        >
                          <Trash2 size={14} className="text-red-600"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {filteredUsers.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <p className="text-sm">没有找到匹配的用户</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserManagementView;
