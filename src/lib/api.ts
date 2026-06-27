// ============================================================
// Business API Functions
// ============================================================

import type { ImageRecord, Stats, PaginatedImages } from './types';
import { apiRequest } from './api-client';

// ---- Public API ----

export async function fetchRandomImage(tag?: string): Promise<ImageRecord> {
  const params = new URLSearchParams();
  if (tag) params.set('tag', tag);
  params.set('format', 'json');
  const query = params.toString();
  return apiRequest<ImageRecord>(
    `/api/random${query ? `?${query}` : ''}`,
    undefined,
    'Failed to fetch random image',
  );
}

export async function fetchStats(): Promise<Stats> {
  return apiRequest<Stats>('/api/stats', undefined, 'Failed to fetch stats');
}

// ---- Gallery API ----

export async function fetchImagesPage(params: {
  page: number;
  pageSize: number;
  search?: string;
  tag?: string | null;
}): Promise<PaginatedImages> {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('pageSize', String(params.pageSize));

  const search = params.search?.trim();
  if (search) query.set('search', search);
  if (params.tag) query.set('tag', params.tag);

  return apiRequest<PaginatedImages>(`/api/list?${query.toString()}`, undefined, 'Failed to fetch images');
}

// ---- Admin API ----

export async function verifyAdminToken(adminToken: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(
    '/api/admin/verify',
    { headers: { Authorization: `Bearer ${adminToken}` } },
    'Failed to verify admin token',
  );
}

function getAdminHeaders(adminToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
  };
}

export async function createImage(
  data: { url: string; title: string; tags: string[] },
  adminToken: string,
): Promise<ImageRecord> {
  return apiRequest<ImageRecord>(
    '/api/create',
    { method: 'POST', headers: getAdminHeaders(adminToken), body: JSON.stringify(data) },
    'Failed to create image',
  );
}

export async function updateImage(
  id: string,
  data: { url?: string; title?: string; tags?: string[] },
  adminToken: string,
): Promise<ImageRecord> {
  return apiRequest<ImageRecord>(
    `/api/update/${id}`,
    { method: 'PUT', headers: getAdminHeaders(adminToken), body: JSON.stringify(data) },
    'Failed to update image',
  );
}

export async function deleteImage(id: string, adminToken: string): Promise<void> {
  await apiRequest<{ success: boolean }>(
    `/api/delete/${id}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } },
    'Failed to delete image',
  );
}

export async function batchCreateImages(
  images: Array<{ url: string; title: string; tags: string[] }>,
  adminToken: string,
): Promise<{
  total: number;
  success: number;
  failed: number;
  results: Array<{ success: boolean; url: string; id?: string; error?: string }>;
}> {
  return apiRequest(
    '/api/batch',
    { method: 'POST', headers: getAdminHeaders(adminToken), body: JSON.stringify({ images }) },
    'Failed to batch create images',
  );
}
