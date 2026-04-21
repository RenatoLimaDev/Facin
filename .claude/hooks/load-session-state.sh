#!/bin/bash
# Fires on SessionStart. Reads .claude/session-state.md and injects into model context.

STATE_FILE=".claude/session-state.md"

if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

CONTEXT=$(cat "$STATE_FILE" | sed 's/"/\\"/g' | tr '\n' ' ')
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"RETOMADA DE SESSÃO ANTERIOR: %s"}}' "$CONTEXT"
