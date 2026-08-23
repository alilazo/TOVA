import { apiUrl } from "@/lib/api"
import { cn } from "@/lib/utils"

const faces: Record<string, number[]> = {
  alex: [3, 4, 6, 7, 10, 11, 12, 13, 18, 21, 26, 29, 34, 37, 42, 43, 44, 45, 51, 52, 54, 55],
  maya: [2, 3, 4, 5, 9, 14, 17, 22, 25, 30, 33, 38, 41, 46, 50, 51, 52, 53, 54, 55],
  ethan: [1, 2, 3, 4, 5, 6, 9, 14, 18, 21, 26, 29, 34, 37, 42, 45, 50, 52, 53, 55],
  noah: [2, 3, 4, 5, 9, 10, 13, 14, 17, 22, 25, 30, 33, 38, 42, 45, 50, 51, 54, 55],
  lina: [1, 2, 3, 4, 5, 6, 8, 15, 17, 22, 25, 30, 33, 38, 41, 46, 49, 54, 58, 59, 60, 61, 62, 63],
  ava: [2, 3, 4, 5, 9, 14, 16, 23, 25, 30, 33, 38, 42, 45, 50, 51, 52, 53, 54, 55],
  rao: [2, 3, 4, 5, 8, 9, 14, 15, 17, 18, 21, 22, 25, 26, 29, 30, 34, 37, 42, 45, 50, 53, 59, 60],
}

interface PixelAvatarProps {
  avatar: string
  name: string
  size?: "sm" | "md" | "lg"
  className?: string
}

export function staffAvatarSrc(avatar: string): string | null {
  if (avatar.startsWith("stock/") || avatar.startsWith("custom/")) {
    return apiUrl(`/api/staff-assets/${avatar}`)
  }
  return null
}

export function PixelAvatar({
  avatar,
  name,
  size = "md",
  className,
}: PixelAvatarProps) {
  const imageSrc = staffAvatarSrc(avatar)
  const faceKey = avatar.replace(/^pixel\//, "").toLowerCase()
  const pixels = faces[faceKey] ?? faces.alex

  return (
    <span
      role="img"
      aria-label={`${name} pixel portrait`}
      className={cn(
        "pixel-avatar",
        `pixel-avatar--${size}`,
        imageSrc && "pixel-avatar--image",
        className,
      )}
    >
      {imageSrc ? (
        <img
          className="pixel-avatar__image"
          src={imageSrc}
          alt=""
          draggable={false}
        />
      ) : (
        Array.from({ length: 64 }, (_, index) => (
          <span
            key={index}
            className={cn("pixel-avatar__cell", pixels.includes(index) && "is-filled")}
          />
        ))
      )}
    </span>
  )
}
