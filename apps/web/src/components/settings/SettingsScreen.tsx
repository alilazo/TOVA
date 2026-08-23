import { useQuery } from "@tanstack/react-query"
import { Activity, Cpu } from "lucide-react"
import { useState } from "react"

import { LocalModelSetupPanel } from "@/components/system/LocalModelSetupPanel"
import { recoveryActionForError } from "@/features/mission/recovery"
import { getRuntimeStatus } from "@/features/models/model-api"

const SETTINGS_SECTIONS = [
  {
    id: "local-model",
    label: "Local model",
    description: "Connect and choose the model used for missions.",
    icon: Cpu,
    group: "Models",
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    description: "Check the web client, API, local model, and project root.",
    icon: Activity,
    group: "Help",
  },
] as const

type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"]

export function SettingsScreen() {
  const [section, setSection] = useState<SettingsSectionId>("local-model")
  const active = SETTINGS_SECTIONS.find((item) => item.id === section) ?? SETTINGS_SECTIONS[0]
  const groups = ["Models", "Help"] as const

  return (
    <section className="settings-screen" aria-label="Settings">
      <nav className="settings-screen__nav" aria-label="Settings categories">
        {groups.map((group) => (
          <div key={group}>
            <p className="settings-screen__nav-label">{group}</p>
            <ul>
              {SETTINGS_SECTIONS.filter((item) => item.group === group).map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={
                        item.id === section
                          ? "settings-screen__nav-item is-active"
                          : "settings-screen__nav-item"
                      }
                      aria-current={item.id === section ? "page" : undefined}
                      onClick={() => setSection(item.id)}
                    >
                      <Icon aria-hidden="true" />
                      <span>{item.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="settings-screen__content">
        <header className="settings-screen__header">
          <h1>{active.label}</h1>
          <p>{active.description}</p>
        </header>

        {section === "local-model" && (
          <div className="settings-screen__panel">
            <LocalModelSetupPanel active className="settings-screen__setup" />
          </div>
        )}
        {section === "diagnostics" && (
          <div className="settings-screen__panel">
            <DiagnosticsPanel />
          </div>
        )}
      </div>
    </section>
  )
}

function DiagnosticsPanel() {
  const status = useQuery({
    queryKey: ["runtime-status"],
    queryFn: getRuntimeStatus,
    retry: 1,
  })
  const error = status.data?.error ?? status.error?.message ?? ""
  const recovery = recoveryActionForError(error || "Unavailable — start your local model server")

  return (
    <div className="diagnostics-panel">
      <dl>
        <dt>Web client</dt>
        <dd>This page. Packaged TOVA serves it from http://127.0.0.1:8000/.</dd>
        <dt>API</dt>
        <dd>
          GET <code>/api/runtime/status</code>
          {status.data?.state ? ` — ${status.data.state}` : status.isPending ? " — checking…" : ""}
        </dd>
        <dt>Local model</dt>
        <dd>
          {status.data?.selectedModel
            ? status.data.selectedModel
            : "No model selected. Default LM Studio endpoint is http://127.0.0.1:1234/v1."}
        </dd>
        <dt>Project root</dt>
        <dd>Open or create a project from Explorer. Paths outside the allowlist are rejected.</dd>
      </dl>
      {recovery ? <p>{recovery}</p> : null}
      <p>
        Full steps: <code>docs/DIAGNOSTICS.md</code>
      </p>
    </div>
  )
}
