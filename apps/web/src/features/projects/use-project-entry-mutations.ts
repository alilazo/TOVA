import { useCallback, useRef, useState } from "react"
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"

import {
  createProjectEntry,
  deleteProjectEntry,
  moveProjectEntry,
  type ProjectEntry,
} from "@/features/projects/project-api"
import { isEntryWithin } from "@/features/projects/project-entry-paths"
import { useUiStore } from "@/stores/ui-store"

interface CreateEntryVariables {
  projectId: string
  path: string
  kind: ProjectEntry["kind"]
}

interface MoveEntryVariables {
  projectId: string
  sourcePath: string
  destinationPath: string
}

interface DeleteEntryVariables {
  projectId: string
  path: string
  recursive: boolean
}

interface ProjectMutationStatus {
  inFlight: number
  latestSubmissionId: number
  error: string | null
}

const EMPTY_PROJECT_STATUS: ProjectMutationStatus = {
  inFlight: 0,
  latestSubmissionId: 0,
  error: null,
}

function isProjectQuery(
  queryKey: readonly unknown[],
  namespace: "project-entries" | "project-references",
  projectId: string,
): boolean {
  return queryKey[0] === namespace && queryKey[1] === projectId
}

function isObsoleteEntryQuery(
  queryKey: readonly unknown[],
  projectId: string,
  obsoletePath: string,
): boolean {
  return isProjectQuery(queryKey, "project-entries", projectId)
    && typeof queryKey[2] === "string"
    && isEntryWithin(queryKey[2], obsoletePath)
}

async function refreshProjectQueries(
  client: QueryClient,
  projectId: string,
  obsoletePath?: string,
): Promise<void> {
  if (obsoletePath) {
    await client.cancelQueries({
      predicate: ({ queryKey }) =>
        isObsoleteEntryQuery(queryKey, projectId, obsoletePath),
    })
  }
  await Promise.all([
    client.invalidateQueries({
      predicate: ({ queryKey }) =>
        isProjectQuery(queryKey, "project-entries", projectId),
      refetchType: "none",
    }),
    client.invalidateQueries({
      predicate: ({ queryKey }) =>
        isProjectQuery(queryKey, "project-references", projectId),
      refetchType: "none",
    }),
  ])
  await Promise.all([
    client.refetchQueries({
      type: "active",
      predicate: ({ queryKey }) => {
        if (!isProjectQuery(queryKey, "project-entries", projectId)) return false
        if (!obsoletePath) return true
        return !isObsoleteEntryQuery(queryKey, projectId, obsoletePath)
      },
    }),
    client.refetchQueries({
      type: "active",
      predicate: ({ queryKey }) =>
        isProjectQuery(queryKey, "project-references", projectId),
    }),
  ])
}

function removeProjectFileQueries(
  client: QueryClient,
  projectId: string,
  path: string,
): void {
  client.removeQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === "project-file"
      && queryKey[1] === projectId
      && typeof queryKey[2] === "string"
      && isEntryWithin(queryKey[2], path),
  })
}

function mutationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error) return error
  return "Project entry operation failed"
}

export function useProjectEntryMutations(projectId: string) {
  const client = useQueryClient()
  const nextSubmissionId = useRef(0)
  const [statusByProject, setStatusByProject] = useState<
    Record<string, ProjectMutationStatus>
  >({})

  const createMutation = useMutation({
    mutationFn: ({ projectId: submittedProjectId, path, kind }: CreateEntryVariables) =>
      createProjectEntry(submittedProjectId, path, kind),
    onSuccess: async (_entry, submitted) => {
      try {
        await refreshProjectQueries(client, submitted.projectId)
      } catch {
        // Filesystem create already succeeded; listing refresh is bookkeeping.
      }
    },
  })

  const moveMutation = useMutation({
    mutationFn: ({
      projectId: submittedProjectId,
      sourcePath,
      destinationPath,
    }: MoveEntryVariables) =>
      moveProjectEntry(submittedProjectId, sourcePath, destinationPath),
    onSuccess: async (_entry, submitted) => {
      useUiStore.getState().relocatePath(
        submitted.sourcePath,
        submitted.destinationPath,
        submitted.projectId,
      )
      removeProjectFileQueries(
        client,
        submitted.projectId,
        submitted.sourcePath,
      )
      try {
        await refreshProjectQueries(
          client,
          submitted.projectId,
          submitted.sourcePath,
        )
      } catch {
        // Filesystem move already succeeded; listing refresh is bookkeeping.
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: ({
      projectId: submittedProjectId,
      path,
      recursive,
    }: DeleteEntryVariables) =>
      deleteProjectEntry(submittedProjectId, path, recursive),
    onSuccess: async (_entry, submitted) => {
      useUiStore.getState().removePathTree(
        submitted.path,
        submitted.projectId,
      )
      removeProjectFileQueries(client, submitted.projectId, submitted.path)
      try {
        await refreshProjectQueries(
          client,
          submitted.projectId,
          submitted.path,
        )
      } catch {
        // Filesystem delete already succeeded; listing refresh is bookkeeping.
      }
    },
  })

  const settleSubmission = useCallback((
    submittedProjectId: string,
    submissionId: number,
    error: string | null,
  ) => {
    setStatusByProject((statuses) => {
      const current = statuses[submittedProjectId] ?? EMPTY_PROJECT_STATUS
      return {
        ...statuses,
        [submittedProjectId]: {
          inFlight: Math.max(0, current.inFlight - 1),
          latestSubmissionId: current.latestSubmissionId,
          error: current.latestSubmissionId === submissionId
            ? error
            : current.error,
        },
      }
    })
  }, [])

  const runMutation = useCallback(async <T,>(
    submittedProjectId: string,
    mutation: () => Promise<T>,
  ): Promise<T> => {
    const submissionId = ++nextSubmissionId.current
    setStatusByProject((statuses) => {
      const current = statuses[submittedProjectId] ?? EMPTY_PROJECT_STATUS
      return {
        ...statuses,
        [submittedProjectId]: {
          inFlight: current.inFlight + 1,
          latestSubmissionId: submissionId,
          error: null,
        },
      }
    })
    try {
      const result = await mutation()
      settleSubmission(submittedProjectId, submissionId, null)
      return result
    } catch (mutationError) {
      settleSubmission(
        submittedProjectId,
        submissionId,
        mutationErrorMessage(mutationError),
      )
      throw mutationError
    }
  }, [settleSubmission])

  const createEntry = useCallback((
    path: string,
    kind: ProjectEntry["kind"],
  ) => runMutation(projectId, () => createMutation.mutateAsync({
    projectId,
    path,
    kind,
  })), [createMutation, projectId, runMutation])

  const moveEntry = useCallback((
    sourcePath: string,
    destinationPath: string,
  ) => runMutation(projectId, () => moveMutation.mutateAsync({
    projectId,
    sourcePath,
    destinationPath,
  })), [moveMutation, projectId, runMutation])

  const deleteEntry = useCallback((
    path: string,
    recursive: boolean,
  ) => runMutation(projectId, () => deleteMutation.mutateAsync({
    projectId,
    path,
    recursive,
  })), [deleteMutation, projectId, runMutation])

  const refreshEntries = useCallback(async () => {
    const predicate = ({ queryKey }: { queryKey: readonly unknown[] }) =>
      isProjectQuery(queryKey, "project-entries", projectId)
    await client.invalidateQueries({
      predicate,
      refetchType: "none",
    })
    await client.refetchQueries({
      predicate,
      type: "active",
    })
    const failed = client.getQueryCache().findAll({ predicate }).find((query) => (
      query.state.status === "error" && query.getObserversCount() > 0
    ))
    if (failed?.state.error) throw failed.state.error
  }, [client, projectId])

  const status = statusByProject[projectId] ?? EMPTY_PROJECT_STATUS

  return {
    createEntry,
    moveEntry,
    deleteEntry,
    refreshEntries,
    pending: status.inFlight > 0,
    error: status.error,
  }
}
