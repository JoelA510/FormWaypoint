@AGENTS.md

## Claude Code

- The workflow skills in `.claude/skills/` (Claude Code's copies of `.agents/skills/`; the
  Workflows section of AGENTS.md says where they come from and how a gap in one is fixed):
  `/discovery` before the next piece of work, `/plan-change` for a large change, `/root-cause`
  for a defect, `/review-change` for a review, `/pre-pr` before a pull request, `/verify`, which
  Claude Code runs before each commit, and `/template-update` to take a template release.
