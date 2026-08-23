import { useMemo, useRef } from "react"

import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface LineNumberedEditorProps {
  id: string
  value: string
  onChange: (value: string) => void
  className?: string
  "aria-label"?: string
}

export function LineNumberedEditor({
  id,
  value,
  onChange,
  className,
  "aria-label": ariaLabel,
}: LineNumberedEditorProps) {
  const gutterRef = useRef<HTMLDivElement>(null)
  const lineCount = useMemo(() => Math.max(value.split("\n").length, 1), [value])

  return (
    <div className={cn("line-numbered-editor", className)}>
      <div
        ref={gutterRef}
        className="line-numbered-editor__gutter"
        data-testid="staff-markdown-line-numbers"
        aria-hidden="true"
      >
        {Array.from({ length: lineCount }, (_, index) => (
          <span key={index + 1} data-line={index + 1}>
            {index + 1}
          </span>
        ))}
      </div>
      <Textarea
        id={id}
        aria-label={ariaLabel}
        className="line-numbered-editor__input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => {
          if (gutterRef.current) {
            gutterRef.current.scrollTop = event.currentTarget.scrollTop
          }
        }}
        spellCheck={false}
      />
    </div>
  )
}
