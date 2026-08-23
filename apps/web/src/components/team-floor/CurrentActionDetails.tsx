import { CheckCircle2, XCircle } from "lucide-react"

type CriterionStatus = "PASS" | "FAIL"

interface CriterionResult {
  label: string
  status: CriterionStatus
}

interface QaVerdict {
  verdict: CriterionStatus
  summary: string
  criteria: CriterionResult[]
  note: string | null
}

interface QaReportSection {
  title: string
  items: string[]
}

interface QaReport {
  title: string
  sections: QaReportSection[]
}

interface QaSummary {
  headline: string
  details: string[]
}

interface CurrentActionDetailsProps {
  action: string | null
  description: string
}

const qaItemPattern =
  /(?:^|\s)(\d+)\.\s+(.+?):\s*(PASS|FAIL)(?=\.?\s+(?:\d+\.\s+|No console|The implementation|$))/gi

const qaReportSectionPattern =
  /\b(Scope|Acceptance Criteria|Commands Run|Results|Conclusion):\s*/gi

function parseQaVerdict(action: string | null): QaVerdict | null {
  const trimmed = action?.trim()
  if (!trimmed) {
    return null
  }

  const verdictMatch = /^QA Verdict:\s*(PASS|FAIL)\.\s*/i.exec(trimmed)
  if (!verdictMatch) {
    return null
  }

  const verdict = verdictMatch[1].toUpperCase() as CriterionStatus
  const body = trimmed.slice(verdictMatch[0].length)
  const [summaryPart, resultsPart = ""] = body.split(/\bResults:\s*/i)
  const criteria: CriterionResult[] = []
  let lastResultIndex = 0

  for (const match of resultsPart.matchAll(qaItemPattern)) {
    criteria.push({
      label: match[2].trim(),
      status: match[3].toUpperCase() as CriterionStatus,
    })
    lastResultIndex = match.index + match[0].length
  }

  if (criteria.length === 0) {
    return null
  }

  const note = resultsPart
    .slice(lastResultIndex)
    .replace(/^\.\s*/, "")
    .trim()

  return {
    verdict,
    summary: summaryPart.trim(),
    criteria,
    note: note || null,
  }
}

function splitReportItems(content: string) {
  const trimmed = content.trim()
  const items = [...trimmed.matchAll(/(?:^|\s)(?:-\s+|\d+\.\s+)(.*?)(?=\s+(?:-\s+|\d+\.\s+)|$)/g)]
    .map((match) => match[1].trim())
    .filter(Boolean)
  return items.length > 0 ? items : [trimmed].filter(Boolean)
}

function parseQaReport(action: string | null): QaReport | null {
  const trimmed = action?.trim()
  const reportMatch = /^QA Test Report:\s*/i.exec(trimmed ?? "")
  if (!trimmed || !reportMatch) return null

  const body = trimmed.slice(reportMatch[0].length)
  const sectionMatches = [...body.matchAll(qaReportSectionPattern)]
  if (sectionMatches.length === 0) return null

  const firstSection = sectionMatches[0]
  const title = body.slice(0, firstSection.index).trim()
  const sections = sectionMatches.map((match, index): QaReportSection => {
    const next = sectionMatches[index + 1]
    const start = match.index + match[0].length
    const end = next ? next.index : body.length
    return {
      title: match[1],
      items: splitReportItems(body.slice(start, end)),
    }
  })

  return {
    title,
    sections,
  }
}

function parseQaSummary(action: string | null): QaSummary | null {
  const trimmed = action?.trim()
  if (!trimmed) return null
  const looksLikeQaSummary =
    /^All acceptance criteria verified and passing\./i.test(trimmed)
    || /\bbrowser audit passed\b/i.test(trimmed)
  if (!looksLikeQaSummary) return null

  const sentences = trimmed
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
  if (sentences.length === 0) return null

  return {
    headline: sentences[0],
    details: sentences.slice(1),
  }
}

function resultStatus(item: string): CriterionStatus | null {
  if (/^PASS:/i.test(item)) return "PASS"
  if (/^FAIL:/i.test(item)) return "FAIL"
  return null
}

function resultText(item: string) {
  return item.replace(/^(PASS|FAIL):\s*/i, "")
}

export function CurrentActionDetails({
  action,
  description,
}: CurrentActionDetailsProps) {
  const qaReport = parseQaReport(action)
  const qaSummary = parseQaSummary(action)
  const qaVerdict = parseQaVerdict(action)

  if (qaReport) {
    return (
      <section className="active-staff-stage__qa-report" aria-label="QA test report">
        <header className="active-staff-stage__qa-report-header">
          <strong>QA Test Report</strong>
          {qaReport.title && <em>{qaReport.title}</em>}
        </header>
        {qaReport.sections.map((section) => {
          const isResults = section.title.toLowerCase() === "results"
          const isConclusion = section.title.toLowerCase() === "conclusion"
          return (
            <section
              key={section.title}
              className="active-staff-stage__qa-report-section"
            >
              <h3>{section.title}</h3>
              {isConclusion ? (
                <p>{section.items.join(" ")}</p>
              ) : (
                <ul aria-label={isResults ? "QA report results" : undefined}>
                  {section.items.map((item) => {
                    const status = resultStatus(item)
                    return (
                      <li
                        key={`${section.title}:${item}`}
                        className={
                          status
                            ? `active-staff-stage__qa-report-result active-staff-stage__qa-report-result--${status.toLowerCase()}`
                            : undefined
                        }
                      >
                        {status ? (
                          <>
                            <strong>{status}</strong>
                            <span>{resultText(item)}</span>
                          </>
                        ) : (
                          <span>{item}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </section>
    )
  }

  if (qaSummary) {
    return (
      <section className="active-staff-stage__qa-summary" aria-label="QA summary">
        <header className="active-staff-stage__qa-report-header">
          <strong>QA Summary</strong>
          <em>{qaSummary.headline}</em>
        </header>
        {qaSummary.details.length > 0 && (
          <ul className="active-staff-stage__qa-summary-list">
            {qaSummary.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  if (!qaVerdict) {
    return (
      <>
        <strong>{action}</strong>
        <p>{description}</p>
      </>
    )
  }

  const passedCount = qaVerdict.criteria.filter((item) => item.status === "PASS").length
  const failedCount = qaVerdict.criteria.length - passedCount
  const isPassing = qaVerdict.verdict === "PASS"

  return (
    <div
      className={
        isPassing
          ? "active-staff-stage__qa active-staff-stage__qa--pass"
          : "active-staff-stage__qa active-staff-stage__qa--fail"
      }
      aria-label="QA verdict"
    >
      <div className="active-staff-stage__qa-header">
        <span className="active-staff-stage__qa-icon" aria-hidden="true">
          {isPassing ? <CheckCircle2 /> : <XCircle />}
        </span>
        <span className="active-staff-stage__qa-title">
          <strong>QA Verdict</strong>
          <em>{qaVerdict.summary}</em>
        </span>
        <span className="active-staff-stage__qa-pill">{qaVerdict.verdict}</span>
      </div>
      <p className="active-staff-stage__qa-count">
        {passedCount} passed{failedCount > 0 ? ` · ${failedCount} failed` : ""}
      </p>
      <ul
        aria-label="Acceptance criteria results"
        className="active-staff-stage__criteria"
      >
        {qaVerdict.criteria.map((criterion) => {
          const passed = criterion.status === "PASS"
          return (
            <li
              key={`${criterion.label}:${criterion.status}`}
              className={
                passed
                  ? "active-staff-stage__criterion active-staff-stage__criterion--pass"
                  : "active-staff-stage__criterion active-staff-stage__criterion--fail"
              }
            >
              <span className="active-staff-stage__criterion-icon" aria-hidden="true">
                {passed ? <CheckCircle2 /> : <XCircle />}
              </span>
              <span>{criterion.label}</span>
              <strong>{criterion.status}</strong>
            </li>
          )
        })}
      </ul>
      {qaVerdict.note && <p className="active-staff-stage__qa-note">{qaVerdict.note}</p>}
    </div>
  )
}
