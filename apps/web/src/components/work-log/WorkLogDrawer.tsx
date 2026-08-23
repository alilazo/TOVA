import { CircleDot, FileOutput, Wrench } from "lucide-react"

import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { StaffProfile, WorkLog } from "@/types/domain"

import { PixelAvatar } from "../staff/PixelAvatar"

interface WorkLogDrawerProps {
  open: boolean
  staff: StaffProfile
  log?: WorkLog
  onOpenChange: (open: boolean) => void
}

const emptyScalar = "No live activity recorded."
const emptyList = "No live entries recorded."

function LogSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="work-log__section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function ItemList({ items }: { items: string[] }) {
  if (items.length === 0) return <p>{emptyList}</p>

  return (
    <ul>
      {items.map((item) => (
        <li key={item}><CircleDot aria-hidden="true" />{item}</li>
      ))}
    </ul>
  )
}

export function WorkLogDrawer({
  open,
  staff,
  log,
  onOpenChange,
}: WorkLogDrawerProps) {
  const inputs = log?.inputs ?? []
  const toolActivity = log?.toolActivity ?? []
  const observations = log?.observations ?? []
  const output = log?.output ?? []
  const errors = log?.errors ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="work-log">
        <SheetHeader>
          <div className="work-log__identity">
            <PixelAvatar avatar={staff.avatar} name={staff.displayName} size="lg" />
            <span>
              <SheetTitle>Work Log</SheetTitle>
              <SheetDescription>{staff.displayName} · {staff.role}</SheetDescription>
            </span>
          </div>
        </SheetHeader>
        <ScrollArea className="work-log__scroll">
          <LogSection title="Current action">
            <p>{log?.currentAction ?? emptyScalar}</p>
          </LogSection>
          <LogSection title="Objective">
            <p>{log?.objective ?? emptyScalar}</p>
          </LogSection>
          <LogSection title="Inputs"><ItemList items={inputs} /></LogSection>
          <LogSection title="Tool activity">
            {toolActivity.length > 0 ? (
              <div className="work-log__tools">
                {toolActivity.map((tool) => (
                  <span key={tool}><Wrench aria-hidden="true" />{tool}</span>
                ))}
              </div>
            ) : <p>{emptyList}</p>}
          </LogSection>
          <LogSection title="Observations"><ItemList items={observations} /></LogSection>
          <LogSection title="Decision summary">
            <p>{log?.decisionSummary ?? emptyScalar}</p>
          </LogSection>
          <LogSection title="Output">
            {output.length > 0 ? (
              <div className="work-log__outputs">
                {output.map((item) => (
                  <span key={item}><FileOutput aria-hidden="true" />{item}</span>
                ))}
              </div>
            ) : <p>{emptyList}</p>}
          </LogSection>
          <LogSection title="Next action">
            <p>{log?.nextAction ?? emptyScalar}</p>
          </LogSection>
          {errors.length > 0 && (
            <LogSection title="Errors"><ItemList items={errors} /></LogSection>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
