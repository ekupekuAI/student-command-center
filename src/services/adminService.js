/**
 * adminService.js — Admin & master-admin API
 *
 * Wraps the /admin endpoints. Only users whose token carries an admin role
 * (admin / master_admin) are authorized; the backend enforces this.
 */

import { apiClient } from './apiClient.js';

export const adminService = {
  getOverview: () => apiClient.get('/admin/overview'),
  listUsers: (status) => apiClient.get(`/admin/users${status ? `?status=${status}` : ''}`),
  approve: (userId) => apiClient.post(`/admin/users/${userId}/approve`),
  reject: (userId) => apiClient.post(`/admin/users/${userId}/reject`),
  deleteUser: (userId) => apiClient.delete(`/admin/users/${userId}`),
  updateUser: (userId, patch) => apiClient.patch(`/admin/users/${userId}`, patch),
  resetPassword: (userId, newPassword) =>
    apiClient.post(`/admin/users/${userId}/reset-password`, { new_password: newPassword }),
  setRole: (userId, role) => apiClient.post(`/admin/users/${userId}/role?role=${encodeURIComponent(role)}`),
};

export const isAdmin = (user) => !!user && (user.role === 'admin' || user.role === 'master_admin');
export const isMasterAdmin = (user) => !!user && user.role === 'master_admin';

export default adminService;