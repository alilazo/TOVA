import {
  formatMetadataValue,
  parseStaffMetadata,
  splitStaffMarkdown,
  type StaffMetadataValue,
} from "@/features/staff/staff-markdown"

interface StaffMetadataPreviewProps {
  markdown: string
}

function MetadataValue({ value }: { value: StaffMetadataValue }) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="staff-metadata__empty">None</span>
    }
    return (
      <ul className="staff-metadata__list">
        {value.map((item, index) => (
          <li key={`${formatMetadataValue(item)}-${index}`}>
            {formatMetadataValue(item)}
          </li>
        ))}
      </ul>
    )
  }

  if (value && typeof value === "object") {
    return (
      <dl className="staff-metadata__nested">
        {Object.entries(value).map(([key, nested]) => (
          <div key={key} className="staff-metadata__row">
            <dt>{key}</dt>
            <dd>{formatMetadataValue(nested)}</dd>
          </div>
        ))}
      </dl>
    )
  }

  return <span>{formatMetadataValue(value)}</span>
}

export function StaffMetadataPreview({ markdown }: StaffMetadataPreviewProps) {
  const { frontmatter } = splitStaffMarkdown(markdown)
  const fields = parseStaffMetadata(frontmatter)

  if (!frontmatter.trim() || fields.length === 0) {
    return (
      <div className="staff-profile-dialog__preview staff-metadata">
        <p className="staff-metadata__empty">No metadata frontmatter found.</p>
      </div>
    )
  }

  return (
    <div className="staff-profile-dialog__preview staff-metadata">
      <dl className="staff-metadata__fields">
        {fields.map((field) => (
          <div key={field.key} className="staff-metadata__row">
            <dt>{field.key}</dt>
            <dd>
              <MetadataValue value={field.value} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
