from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
IMAGE_DIR = ROOT / "packages" / "pixel-staff" / "assets" / "images"
ANIMATION_DIR = ROOT / "packages" / "pixel-staff" / "assets" / "animations"
REVIEW_DIR = ROOT / "packages" / "pixel-staff" / "assets" / "_review"

BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
SPRITE_SIZE = 64


@dataclass(frozen=True)
class Frame:
    name: str
    image: Image.Image


@dataclass(frozen=True)
class Animation:
    slug: str
    fps: int
    frames: list[Frame]


def rect(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int]) -> None:
    draw.rectangle(xy, fill=BLACK)


def erase(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int]) -> None:
    draw.rectangle(xy, fill=WHITE)


def line(draw: ImageDraw.ImageDraw, points: Iterable[tuple[int, int]], width: int = 1) -> None:
    draw.line(list(points), fill=BLACK, width=width)


def side_character(
    *,
    bob: int = 0,
    lean: int = 0,
    arm_front: tuple[int, int] = (41, 42),
    arm_back: tuple[int, int] = (24, 42),
    leg_front: tuple[int, int] = (40, 55),
    leg_back: tuple[int, int] = (25, 55),
    airborne: int = 0,
    arms_up: bool = False,
) -> Image.Image:
    img = Image.new("RGB", (SPRITE_SIZE, SPRITE_SIZE), WHITE)
    draw = ImageDraw.Draw(img)
    y = bob - airborne
    lx = lean

    # Back leg/arm first so the readable silhouette stays clean.
    line(draw, [(32 + lx, 41 + y), (28 + lx, 48 + y), leg_back], width=4)
    rect(draw, (leg_back[0] - 3, leg_back[1] - 1, leg_back[0] + 5, leg_back[1] + 2))
    if arms_up:
        line(draw, [(30 + lx, 32 + y), (25 + lx, 24 + y), (23 + lx, 17 + y)], width=4)
    else:
        line(draw, [(30 + lx, 31 + y), (27 + lx, 37 + y), arm_back], width=4)
        rect(draw, (arm_back[0] - 1, arm_back[1] - 1, arm_back[0] + 3, arm_back[1] + 2))

    # Jacket, shirt, and tie.
    rect(draw, (27 + lx, 30 + y, 40 + lx, 45 + y))
    erase(draw, (31 + lx, 31 + y, 36 + lx, 44 + y))
    line(draw, [(28 + lx, 31 + y), (32 + lx, 37 + y)], width=1)
    line(draw, [(39 + lx, 31 + y), (35 + lx, 37 + y)], width=1)
    rect(draw, (33 + lx, 35 + y, 35 + lx, 42 + y))

    line(draw, [(35 + lx, 41 + y), (38 + lx, 48 + y), leg_front], width=4)
    rect(draw, (leg_front[0] - 2, leg_front[1] - 1, leg_front[0] + 6, leg_front[1] + 2))
    if arms_up:
        line(draw, [(39 + lx, 32 + y), (45 + lx, 24 + y), (47 + lx, 17 + y)], width=4)
    else:
        line(draw, [(39 + lx, 31 + y), (42 + lx, 37 + y), arm_front], width=4)
        rect(draw, (arm_front[0] - 1, arm_front[1] - 1, arm_front[0] + 3, arm_front[1] + 2))

    # Neck, side-facing head, glasses, and the same side-part hair language.
    rect(draw, (33 + lx, 26 + y, 36 + lx, 31 + y))
    rect(draw, (28 + lx, 11 + y, 43 + lx, 27 + y))
    erase(draw, (31 + lx, 14 + y, 41 + lx, 24 + y))
    rect(draw, (28 + lx, 10 + y, 43 + lx, 15 + y))
    rect(draw, (38 + lx, 14 + y, 43 + lx, 20 + y))
    rect(draw, (42 + lx, 18 + y, 44 + lx, 23 + y))
    draw.rectangle((34 + lx, 17 + y, 38 + lx, 21 + y), outline=BLACK)
    draw.rectangle((39 + lx, 17 + y, 43 + lx, 21 + y), outline=BLACK)
    line(draw, [(38 + lx, 19 + y), (39 + lx, 19 + y)])
    rect(draw, (43 + lx, 20 + y, 45 + lx, 21 + y))
    line(draw, [(37 + lx, 24 + y), (41 + lx, 24 + y)])

    return img


def front_arm_up(progress: int) -> Image.Image:
    img = Image.new("RGB", (SPRITE_SIZE, SPRITE_SIZE), WHITE)
    draw = ImageDraw.Draw(img)
    right_arm = [(41, 32), (45, 27), (47, 22), (47, 17)][progress]

    line(draw, [(21, 33), (21, 47)], width=5)
    rect(draw, (20, 46, 25, 49))
    line(draw, [(42, 33), right_arm], width=5)
    rect(draw, (right_arm[0] - 2, right_arm[1] - 2, right_arm[0] + 2, right_arm[1] + 2))

    rect(draw, (25, 30, 40, 46))
    erase(draw, (30, 31, 35, 45))
    line(draw, [(26, 31), (31, 39)])
    line(draw, [(39, 31), (34, 39)])
    rect(draw, (32, 35, 34, 42))
    rect(draw, (26, 43, 30, 56))
    rect(draw, (35, 43, 39, 56))
    rect(draw, (24, 55, 31, 58))
    rect(draw, (34, 55, 41, 58))

    rect(draw, (24, 10, 40, 27))
    erase(draw, (26, 13, 38, 25))
    rect(draw, (24, 9, 40, 14))
    rect(draw, (34, 13, 40, 18))
    rect(draw, (23, 17, 25, 22))
    rect(draw, (39, 17, 41, 22))
    draw.rectangle((27, 16, 31, 20), outline=BLACK)
    draw.rectangle((34, 16, 38, 20), outline=BLACK)
    line(draw, [(31, 18), (34, 18)])
    rect(draw, (33, 21, 33, 21))
    line(draw, [(31, 23), (35, 23)])
    return img


def make_walk() -> Animation:
    poses = [
        (0, 0, (42, 42), (24, 42), (40, 55), (26, 55)),
        (1, 0, (39, 43), (27, 41), (37, 56), (29, 54)),
        (0, 0, (34, 43), (32, 40), (34, 55), (33, 55)),
        (-1, 0, (28, 41), (39, 43), (27, 55), (40, 55)),
        (0, 0, (31, 40), (36, 43), (30, 54), (37, 56)),
        (1, 0, (38, 41), (29, 43), (34, 55), (33, 55)),
    ]
    frames = [
        Frame(f"walk-sideways-{idx + 1:02d}", side_character(bob=bob, lean=lean, arm_front=af, arm_back=ab, leg_front=lf, leg_back=lb))
        for idx, (bob, lean, af, ab, lf, lb) in enumerate(poses)
    ]
    return Animation("walk-sideways", 8, frames)


def make_run() -> Animation:
    poses = [
        (0, 2, (45, 39), (22, 43), (45, 55), (23, 55)),
        (-1, 3, (42, 35), (24, 46), (41, 53), (27, 57)),
        (1, 2, (35, 36), (33, 46), (35, 49), (34, 49)),
        (0, 2, (24, 43), (45, 39), (23, 55), (45, 55)),
        (-1, 3, (27, 46), (42, 35), (27, 57), (41, 53)),
        (1, 2, (33, 46), (35, 36), (34, 49), (35, 49)),
    ]
    frames = [
        Frame(f"run-sideways-{idx + 1:02d}", side_character(bob=bob, lean=lean, arm_front=af, arm_back=ab, leg_front=lf, leg_back=lb))
        for idx, (bob, lean, af, ab, lf, lb) in enumerate(poses)
    ]
    return Animation("run-sideways", 12, frames)


def make_jump() -> Animation:
    poses = [
        (2, 1, (39, 43), (27, 42), (38, 57), (29, 57), 0, False),
        (0, 1, (43, 39), (25, 39), (42, 54), (25, 54), 3, True),
        (-1, 1, (44, 35), (25, 35), (40, 48), (28, 48), 9, True),
        (-1, 1, (44, 35), (25, 35), (39, 47), (30, 48), 12, True),
        (0, 1, (41, 39), (28, 39), (38, 52), (31, 52), 6, False),
        (2, 1, (38, 43), (29, 42), (37, 57), (31, 57), 0, False),
    ]
    frames = [
        Frame(
            f"jump-{idx + 1:02d}",
            side_character(
                bob=bob,
                lean=lean,
                arm_front=af,
                arm_back=ab,
                leg_front=lf,
                leg_back=lb,
                airborne=airborne,
                arms_up=arms_up,
            ),
        )
        for idx, (bob, lean, af, ab, lf, lb, airborne, arms_up) in enumerate(poses)
    ]
    return Animation("jump", 8, frames)


def make_arm_up() -> Animation:
    poses = [0, 1, 2, 3, 2, 1]
    frames = [Frame(f"arm-up-{frame_index + 1:02d}", front_arm_up(pose)) for frame_index, pose in enumerate(poses)]
    return Animation("arm-up", 8, frames)


def save_animation(character_slug: str, animation: Animation) -> None:
    base = ANIMATION_DIR / character_slug / animation.slug
    frames_dir = base / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    for index, frame in enumerate(animation.frames):
        frame.image.save(frames_dir / f"black-white-pixel-art-{character_slug}-{frame.name}-64x64.png")

    sheet = Image.new("RGB", (SPRITE_SIZE * len(animation.frames), SPRITE_SIZE), WHITE)
    for index, frame in enumerate(animation.frames):
        sheet.paste(frame.image, (index * SPRITE_SIZE, 0))
    sheet.save(base / f"black-white-pixel-art-{character_slug}-{animation.slug}-64x64-spritesheet.png")

    duration_ms = int(round(1000 / animation.fps))
    animation.frames[0].image.save(
        base / f"black-white-pixel-art-{character_slug}-{animation.slug}-64x64-preview.gif",
        save_all=True,
        append_images=[frame.image for frame in animation.frames[1:]],
        duration=duration_ms,
        loop=0,
        disposal=2,
    )


def save_review_sheet(character_slug: str, animations: list[Animation]) -> Path:
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    cell = SPRITE_SIZE * 3
    label_height = 18
    width = max(len(animation.frames) for animation in animations) * cell
    height = len(animations) * (cell + label_height)
    sheet = Image.new("RGB", (width, height), WHITE)
    draw = ImageDraw.Draw(sheet)
    for row, animation in enumerate(animations):
        y = row * (cell + label_height)
        draw.text((4, y + 2), animation.slug, fill=BLACK)
        for column, frame in enumerate(animation.frames):
            scaled = frame.image.resize((cell, cell), Image.Resampling.NEAREST)
            sheet.paste(scaled, (column * cell, y + label_height))
    review_path = REVIEW_DIR / f"black-white-pixel-art-{character_slug}-animation-review-sheet.png"
    sheet.save(review_path)
    return review_path


def validate_outputs(character_slug: str, animations: list[Animation]) -> None:
    expected = {BLACK, WHITE}
    for animation in animations:
        base = ANIMATION_DIR / character_slug / animation.slug
        files = list((base / "frames").glob("*.png")) + list(base.glob("*.png"))
        for path in files:
            image = Image.open(path).convert("RGB")
            colors = {color for _, color in image.getcolors(maxcolors=65536)}
            if colors != expected:
                raise RuntimeError(f"{path} has non-monochrome palette: {sorted(colors)}")
            if path.name.endswith("-spritesheet.png"):
                expected_size = (SPRITE_SIZE * len(animation.frames), SPRITE_SIZE)
            else:
                expected_size = (SPRITE_SIZE, SPRITE_SIZE)
            if image.size != expected_size:
                raise RuntimeError(f"{path} has size {image.size}, expected {expected_size}")


def main() -> None:
    reference = IMAGE_DIR / "black-white-pixel-art-guy-with-hair-and-glasses-64x64.png"
    if not reference.exists():
        raise FileNotFoundError(reference)

    character_slug = "guy-with-hair-and-glasses"
    factories: list[Callable[[], Animation]] = [make_walk, make_run, make_jump, make_arm_up]
    animations = [factory() for factory in factories]
    for animation in animations:
        save_animation(character_slug, animation)
    validate_outputs(character_slug, animations)
    review_path = save_review_sheet(character_slug, animations)

    print("ANIMATION_VALIDATION_OK")
    print(f"character={character_slug}")
    print(f"animations={','.join(animation.slug for animation in animations)}")
    print(f"review_sheet={review_path}")


if __name__ == "__main__":
    main()
