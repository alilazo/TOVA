import type { StaffProfile } from "@/types/domain"

function staffProfile(
  id: string,
  displayName: string,
  role: string,
  roleKey: string,
  index: number,
): StaffProfile {
  return {
    id,
    employeeId: `TEST-${index.toString().padStart(3, "0")}`,
    slug: `${displayName.toLowerCase().replaceAll(" ", "-")}-${roleKey}`,
    name: displayName,
    displayName,
    role,
    roleKey,
    department: "Test Engineering",
    seniority: "Senior",
    avatar: displayName === "Dr. Rao" ? "rao" : displayName.toLowerCase().replaceAll(" ", "-"),
    description: `${displayName} is a test-only staff profile.`,
    status: "available",
    modelProfile: "test-profile",
    tools: ["Test tool"],
    canDelegate: roleKey === "project_coordinator",
    canApprove: roleKey === "qa_tester",
    tags: ["test"],
  }
}

export const staffProfiles: StaffProfile[] = [
  staffProfile("staff_alex", "Alex", "Project Coordinator", "project_coordinator", 1),
  staffProfile("staff_maya", "Maya", "Researcher", "researcher", 2),
  staffProfile("staff_ethan", "Ethan", "Software Engineer", "software_engineer", 3),
  staffProfile("staff_noah", "Noah", "Back-End Developer", "backend_developer", 4),
  staffProfile("staff_lina", "Lina", "Front-End Developer", "frontend_developer", 5),
  staffProfile("staff_ava", "Ava", "QA Tester", "qa_tester", 6),
  staffProfile("staff_rao", "Dr. Rao", "Advisor", "advisor", 7),
]
