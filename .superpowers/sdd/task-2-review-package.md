# Task 2 review package
## App.tsx excerpt (TeamFloor wiring)

  apps\web\src\app\App.tsx:12:import { WorkspaceSidebar } from "@/components/shell/WorkspaceSidebar"
  apps\web\src\app\App.tsx:13:import { EngineeringTeamPanel } from "@/components/staff/EngineeringTeamPanel"
> apps\web\src\app\App.tsx:14:import { TeamFloor } from "@/components/team-floor/TeamFloor"
  apps\web\src\app\App.tsx:15:import { WorkLogDrawer } from "@/components/work-log/WorkLogDrawer"
  apps\web\src\app\App.tsx:16:import { useLiveRuntime } from "@/features/mission/use-live-runtime"
  apps\web\src\app\App.tsx:17:import { getRuntimeStatus } from "@/features/models/model-api"
  apps\web\src\app\App.tsx:18:import { getActiveProject, type ProjectRecord } from "@/features/projects/project-api"
  apps\web\src\app\App.tsx:19:import { getStaffProfiles } from "@/features/staff/staff-api"
  apps\web\src\app\App.tsx:24:  const client = useQueryClient()
  apps\web\src\app\App.tsx:25:  const activePanel = useUiStore((state) => state.activePanel)
> apps\web\src\app\App.tsx:26:  const setActivePanel = useUiStore((state) => state.setActivePanel)
  apps\web\src\app\App.tsx:27:  const selectedStaffId = useUiStore((state) => state.selectedStaffId)
  apps\web\src\app\App.tsx:28:  const selectStaff = useUiStore((state) => state.selectStaff)
  apps\web\src\app\App.tsx:29:  const workLogOpen = useUiStore((state) => state.workLogOpen)
  apps\web\src\app\App.tsx:30:  const setWorkLogOpen = useUiStore((state) => state.setWorkLogOpen)
  apps\web\src\app\App.tsx:31:  const activeFile = useUiStore((state) => state.activeFile)
> apps\web\src\app\App.tsx:32:  const openFiles = useUiStore((state) => state.openFiles)
> apps\web\src\app\App.tsx:33:  const openFile = useUiStore((state) => state.openFile)
  apps\web\src\app\App.tsx:34:  const closeFile = useUiStore((state) => state.closeFile)
  apps\web\src\app\App.tsx:35:  const clearFiles = useUiStore((state) => state.clearFiles)
  apps\web\src\app\App.tsx:36:  const liveRuntime = useLiveRuntime()
  apps\web\src\app\App.tsx:37:  const runtimeStatus = useQuery({
  apps\web\src\app\App.tsx:38:    queryKey: ["runtime-status"],
  apps\web\src\app\App.tsx:60:    const path = liveRuntime.projection.activeFile
  apps\web\src\app\App.tsx:61:    if (!path) return
> apps\web\src\app\App.tsx:62:    openFile(path)
  apps\web\src\app\App.tsx:63:    void client.invalidateQueries({ queryKey: ["project-entries", project.data?.id] })
  apps\web\src\app\App.tsx:64:    void client.invalidateQueries({
  apps\web\src\app\App.tsx:65:      queryKey: ["project-file", project.data?.id, path],
  apps\web\src\app\App.tsx:66:    })
  apps\web\src\app\App.tsx:67:  }, [
  apps\web\src\app\App.tsx:69:    liveRuntime.projection.activeFile,
  apps\web\src\app\App.tsx:70:    liveRuntime.projection.fileRevision,
> apps\web\src\app\App.tsx:71:    openFile,
  apps\web\src\app\App.tsx:72:    project.data?.id,
  apps\web\src\app\App.tsx:73:  ])
  apps\web\src\app\App.tsx:74:
  apps\web\src\app\App.tsx:75:  const selectedStaff =
  apps\web\src\app\App.tsx:76:    roster.find((profile) => profile.id === selectedStaffId) ?? roster[0] ?? null
  apps\web\src\app\App.tsx:86:        project={project.data}
  apps\web\src\app\App.tsx:87:        activeFile={activeFile}
> apps\web\src\app\App.tsx:88:        onOpenFile={openFile}
  apps\web\src\app\App.tsx:89:        onProjectOpened={onProjectOpened}
  apps\web\src\app\App.tsx:90:      />
  apps\web\src\app\App.tsx:91:    ) : null)
  apps\web\src\app\App.tsx:92:    : (
  apps\web\src\app\App.tsx:93:      <WorkspaceSidebar
  apps\web\src\app\App.tsx:117:      )}
  apps\web\src\app\App.tsx:118:      {activePanel === "team-floor" ? (
> apps\web\src\app\App.tsx:119:        <TeamFloor
  apps\web\src\app\App.tsx:120:          staff={roster}
  apps\web\src\app\App.tsx:121:          currentStaffId={liveRuntime.projection.currentStaffId}
  apps\web\src\app\App.tsx:122:          statuses={liveRuntime.projection.staffStatuses}
  apps\web\src\app\App.tsx:123:          selectedStaffIds={liveRuntime.projection.selectedStaffIds}
  apps\web\src\app\App.tsx:124:          artifacts={liveRuntime.projection.artifacts}
  apps\web\src\app\App.tsx:137:          startedAt={liveRuntime.projection.startedAt}
  apps\web\src\app\App.tsx:138:          endedAt={liveRuntime.projection.endedAt}
> apps\web\src\app\App.tsx:139:          onOpenWorkOutput={(path) => {
> apps\web\src\app\App.tsx:140:            openFile(path)
> apps\web\src\app\App.tsx:141:            setActivePanel("explorer")
  apps\web\src\app\App.tsx:142:          }}
  apps\web\src\app\App.tsx:143:        />
  apps\web\src\app\App.tsx:144:      ) : (
  apps\web\src\app\App.tsx:145:        <CodeWorkspace
  apps\web\src\app\App.tsx:146:          staff={roster}
  apps\web\src\app\App.tsx:147:          projectId={project.data?.id ?? null}
  apps\web\src\app\App.tsx:148:          activeFile={activeFile}
> apps\web\src\app\App.tsx:149:          openFiles={openFiles}
  apps\web\src\app\App.tsx:150:          editorOwnerId={liveRuntime.projection.editorOwnerId}
  apps\web\src\app\App.tsx:151:          missionStatus={liveRuntime.projection.status}
> apps\web\src\app\App.tsx:152:          onSelectFile={openFile}
  apps\web\src\app\App.tsx:153:          onCloseFile={closeFile}
  apps\web\src\app\App.tsx:154:          onProjectOpened={onProjectOpened}
  apps\web\src\app\App.tsx:155:        />
  apps\web\src\app\App.tsx:156:      )}
  apps\web\src\app\App.tsx:157:      {hasProject && (
  apps\web\src\app\App.tsx:169:    <AppShell
  apps\web\src\app\App.tsx:170:      activePanel={activePanel}
> apps\web\src\app\App.tsx:171:      onPanelChange={setActivePanel}
  apps\web\src\app\App.tsx:172:      sidebar={sidebar}
  apps\web\src\app\App.tsx:173:      workspace={workspace}
  apps\web\src\app\App.tsx:174:      teamPanel={(
  apps\web\src\app\App.tsx:175:        <EngineeringTeamPanel
  apps\web\src\app\App.tsx:176:          staff={roster}
  apps\web\src\app\App.tsx:199:              onStart={(request) => {
  apps\web\src\app\App.tsx:200:                if (!project.data) return
> apps\web\src\app\App.tsx:201:                setActivePanel("team-floor")
  apps\web\src\app\App.tsx:202:                void liveRuntime.start({
  apps\web\src\app\App.tsx:203:                  request: request.request,
  apps\web\src\app\App.tsx:204:                  projectId: project.data.id,
  apps\web\src\app\App.tsx:205:                  modelProfileId: request.modelProfile,
  apps\web\src\app\App.tsx:206:                  model: request.model,




## open-work-output.test.ts

import { beforeEach, describe, expect, it } from "vitest"

import { useUiStore } from "@/stores/ui-store"

describe("open work output navigation", () => {
  beforeEach(() => {
    useUiStore.setState({
      activePanel: "team-floor",
      activeFile: null,
      openFiles: [],
    })
  })

  it("opens the file and switches to explorer", () => {
    const { openFile, setActivePanel } = useUiStore.getState()
    openFile("style.css")
    setActivePanel("explorer")

    const state = useUiStore.getState()
    expect(state.activeFile).toBe("style.css")
    expect(state.openFiles).toContain("style.css")
    expect(state.activePanel).toBe("explorer")
  })
})
