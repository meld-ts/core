#!/bin/sh
set -e
bun run lint &
LINT_PID=$!
bun run ts-check &
TSC_PID=$!
wait $LINT_PID && wait $TSC_PID
