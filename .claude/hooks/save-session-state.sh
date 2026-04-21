#!/bin/bash
# Fires on PreCompact (before context compaction ~80% tokens).
# Writes .claude/session-state.md so the next session knows where to resume.

STATE_FILE=".claude/session-state.md"
DATE=$(date '+%Y-%m-%d %H:%M')

# Resolve current feature from .specify/feature.json
FEATURE_DIR=$(jq -r '.feature_directory // empty' .specify/feature.json 2>/dev/null)
TASKS_FILE="${FEATURE_DIR}/tasks.md"
SPEC_FILE="${FEATURE_DIR}/spec.md"

# Count tasks
if [ -f "$TASKS_FILE" ]; then
  DONE=$(grep -c '^\- \[x\]' "$TASKS_FILE" 2>/dev/null); DONE=${DONE:-0}
  TOTAL=$(grep -c '^\- \[.\]' "$TASKS_FILE" 2>/dev/null); TOTAL=${TOTAL:-0}
  LAST_DONE=$(grep '^\- \[x\]' "$TASKS_FILE" 2>/dev/null | tail -3 | sed 's/^/  /')
  NEXT_PENDING=$(grep '^\- \[ \]' "$TASKS_FILE" 2>/dev/null | head -3 | sed 's/^/  /')
else
  DONE=0; TOTAL=0; LAST_DONE=""; NEXT_PENDING=""
fi

# Get current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# Get last 3 commits
RECENT_COMMITS=$(git log --oneline -3 2>/dev/null | sed 's/^/  /' || echo "  (sem commits)")

cat > "$STATE_FILE" <<EOF
# Session State (auto-saved: $DATE)

## Contexto
- **Branch**: $BRANCH
- **Feature**: $FEATURE_DIR
- **Spec**: $SPEC_FILE

## Progresso das Tarefas
- Concluídas: $DONE / $TOTAL

### Últimas concluídas
$LAST_DONE

### Próximas pendentes (retomar aqui)
$NEXT_PENDING

## Commits Recentes
$RECENT_COMMITS

## Próximo passo
Ler tasks.md em $TASKS_FILE, continuar na primeira tarefa com \`- [ ]\`.
EOF

# Inject into compaction summary (PreCompact additionalContext)
CONTEXT=$(cat "$STATE_FILE" | sed 's/"/\\"/g' | tr '\n' ' ')
printf '{"hookSpecificOutput":{"hookEventName":"PreCompact","additionalContext":"%s"}}' "$CONTEXT"
