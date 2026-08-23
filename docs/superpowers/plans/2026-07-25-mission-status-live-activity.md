# Mission Status in Live Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or implement inline for this small change. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the linear mission progress strip and show a discrete mission status badge in the Live Activity header.

**Architecture:** Map existing `MissionStatus` (plus idle when no mission) to operator labels via a pure helper. Pass status into `ActivityFeed`. Delete `MissionStageStrip` usage and related stage-strip CSS.

**Tech Stack:** React, Vitest, existing `MissionStatus` type.

## Global Constraints

- Delete step dots and progress percent UI entirely
- Status lives in Live Activity header only
- Operator labels: Idle, Draft, Running, Paused, Waiting for confirmation, Blocked, Finished, Error, Cancelled
- Restrained styling; no decorative chrome
- TDD for the label mapper

---

### Task 1: Status label helper + ActivityFeed badge + remove strip

**Files:**
- Create: `apps/web/src/features/mission/mission-status-label.ts`
- Create: `apps/web/tests/mission-status-label.test.ts`
- Modify: `apps/web/src/components/activity/ActivityFeed.tsx`
- Modify: `apps/web/src/app/App.tsx`
- Delete: `apps/web/src/components/mission/MissionStageStrip.tsx` (if unused)
- Modify: `apps/web/src/styles/globals.css` (remove `.stage-strip*` ; add badge styles)
- Modify: e2e if it asserts stage-strip / Mission progress

- [ ] Mapper + tests
- [ ] Wire ActivityFeed + App; remove strip
- [ ] `pnpm --filter @tova/web test` + typecheck; e2e if needed
