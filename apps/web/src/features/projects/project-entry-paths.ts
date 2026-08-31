function invalidProjectRelativePath(path: string): Error {
  return new Error(`Expected a project-relative path: ${JSON.stringify(path)}`)
}

export function assertProjectRelativePath(
  path: string,
  allowRoot = false,
): string {
  if (path.length === 0 || path.trim().length === 0) {
    throw invalidProjectRelativePath(path)
  }

  const slashPath = path.replaceAll("\\", "/")
  if (slashPath.startsWith("/") || /^[A-Za-z]:/.test(slashPath)) {
    throw invalidProjectRelativePath(path)
  }
  if (slashPath === ".") {
    if (allowRoot) return "."
    throw invalidProjectRelativePath(path)
  }
  if (/^\.\/+$/.test(slashPath)) throw invalidProjectRelativePath(path)

  const segments = slashPath
    .replace(/^\.\/+/, "")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
  if (segments.length === 0 || segments.includes("..")) {
    throw invalidProjectRelativePath(path)
  }

  return segments.join("/")
}

export function normalizeEntryPath(path: string): string {
  return assertProjectRelativePath(path, true)
}

export function entryParent(path: string): string {
  const normalized = normalizeEntryPath(path)
  if (normalized === ".") return "."

  const index = normalized.lastIndexOf("/")
  return index < 0 ? "." : normalized.slice(0, index)
}

export function entryName(path: string): string {
  const normalized = normalizeEntryPath(path)
  return normalized === "." ? "" : (normalized.split("/").at(-1) ?? "")
}

export function joinEntryPath(parent: string, name: string): string {
  const normalizedParent = assertProjectRelativePath(parent, true)
  const normalizedName = assertProjectRelativePath(name)

  return normalizedParent === "."
    ? normalizedName
    : `${normalizedParent}/${normalizedName}`
}

export function isEntryWithin(path: string, root: string): boolean {
  const normalizedPath = normalizeEntryPath(path)
  const normalizedRoot = normalizeEntryPath(root)

  return normalizedRoot === "."
    || normalizedPath === normalizedRoot
    || normalizedPath.startsWith(`${normalizedRoot}/`)
}

export function remapEntryPath(
  path: string,
  source: string,
  destination: string,
): string {
  if (!isEntryWithin(path, source)) return path

  const normalizedPath = normalizeEntryPath(path)
  const normalizedSource = normalizeEntryPath(source)
  const normalizedDestination = normalizeEntryPath(destination)
  const suffix = normalizedSource === "."
    ? normalizedPath === "." ? "" : `/${normalizedPath}`
    : normalizedPath.slice(normalizedSource.length)

  if (!suffix) return normalizedDestination
  return normalizedDestination === "."
    ? suffix.slice(1)
    : `${normalizedDestination}${suffix}`
}

export function absoluteEntryPath(root: string, path: string): string {
  const normalized = normalizeEntryPath(path)
  if (normalized === ".") return root

  const separator = root.includes("\\") ? "\\" : "/"
  return `${root.replace(/[\\/]+$/, "")}${separator}${normalized.replaceAll(
    "/",
    separator,
  )}`
}
