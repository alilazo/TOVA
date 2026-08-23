import { apiRequest, apiUrl } from "@/lib/api"
import type { StaffProfile, StaffStatus } from "@/types/domain"

interface StaffProfileResponse {
  id: string
  employee_id: string
  slug: string
  name: string
  display_name: string
  role: string
  role_key: string
  department: string
  seniority: string
  avatar: string
  description: string
  status: string
  model_profile: string
  tools: string[]
  can_delegate: boolean
  can_approve: boolean
  tags: string[]
}

export interface StaffDocument {
  id: string
  slug: string
  markdown: string
}

export function getStaffProfiles(): Promise<StaffProfile[]> {
  return apiRequest<StaffProfileResponse[]>("/api/staff").then((rows) =>
    rows.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      slug: row.slug,
      name: row.name,
      displayName: row.display_name,
      role: row.role,
      roleKey: row.role_key,
      department: row.department,
      seniority: row.seniority,
      avatar: row.avatar.startsWith("pixel/")
        ? row.avatar.slice("pixel/".length)
        : row.avatar,
      description: row.description,
      status: row.status as StaffStatus,
      modelProfile: row.model_profile,
      tools: row.tools,
      canDelegate: row.can_delegate,
      canApprove: row.can_approve,
      tags: row.tags,
    })),
  )
}

export function getStaffDocument(staffId: string): Promise<StaffDocument> {
  return apiRequest<StaffDocument>(`/api/staff/${staffId}/document`)
}

export function saveStaffDocument(
  staffId: string,
  markdown: string,
): Promise<StaffDocument> {
  return apiRequest<StaffDocument>(`/api/staff/${staffId}/document`, {
    method: "PUT",
    body: JSON.stringify({ markdown }),
  })
}

export interface StaffAvatarCatalog {
  stock: string[]
}

export interface StaffAvatarResult {
  id: string
  avatar: string
}

export function getStaffAvatarCatalog(): Promise<StaffAvatarCatalog> {
  return apiRequest<StaffAvatarCatalog>("/api/staff/avatar-catalog")
}

export function selectStaffAvatar(
  staffId: string,
  filename: string,
): Promise<StaffAvatarResult> {
  return apiRequest<StaffAvatarResult>(`/api/staff/${staffId}/avatar`, {
    method: "PUT",
    body: JSON.stringify({ avatar: `stock/${filename}` }),
  })
}

export async function uploadStaffAvatar(
  staffId: string,
  file: File,
): Promise<StaffAvatarResult> {
  const body = new FormData()
  body.append("file", file)
  const response = await fetch(apiUrl(`/api/staff/${staffId}/avatar`), {
    method: "POST",
    body,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(payload?.detail ?? `TOVA API request failed (${response.status})`)
  }
  return response.json() as Promise<StaffAvatarResult>
}
