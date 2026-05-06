#!/bin/bash
set -e

TEST_DIR=$(mktemp -d)
echo "Test directory: $TEST_DIR"

cleanup() {
    echo "Cleaning up..."
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

GITHUB_REPO="$TEST_DIR/github-repo"
INTERNAL_REPO="$TEST_DIR/internal-repo"
STATE_DIR="$TEST_DIR/state"
REPO_DIR="$TEST_DIR/repos"
CONFIG_FILE="$TEST_DIR/test-config.yaml"

mkdir -p "$STATE_DIR" "$REPO_DIR"

echo "=== Creating simulated GitHub repo ==="
mkdir -p "$GITHUB_REPO"
cd "$GITHUB_REPO"
git init
git config user.email "alice@personal.com"
git config user.name "Alice Personal"

echo "# Test Project" > README.md
git add README.md
git commit -m "Initial commit by Alice"

echo "Some content" > file1.txt
git add file1.txt
git commit -m "Add file1 by Alice"

git config user.email "bob@gmail.com"
git config user.name "Bob Gmail"

echo "More content" > file2.txt
git add file2.txt
git commit -m "Add file2 by Bob"

git config user.email "alice@personal.com"
git config user.name "Alice Personal"

echo "Update" >> file1.txt
git add file1.txt
git commit -m "Update file1 by Alice"

echo "GitHub repo commits:"
git log --format="%h - %an <%ae> - %s" --all

echo ""
echo "=== Creating simulated internal repo ==="
mkdir -p "$INTERNAL_REPO"
cd "$INTERNAL_REPO"
git init --bare

echo ""
echo "=== Creating test config ==="
cat > "$CONFIG_FILE" << EOF
version: 1
settings:
  state_dir: $STATE_DIR
  repo_dir: $REPO_DIR
  log_level: INFO
  max_concurrent: 5
  default_schedule: "0 0 */7 * *"
  timezone: "Asia/Shanghai"
  unmapped_author_policy: warn

author_mappings:
  - match_email: "alice@personal.com"
    internal_name: "Alice Wang"
    internal_email: "alice.wang@internal.corp"
  - match_email: "bob@gmail.com"
    internal_name: "Bob Zhang"
    internal_email: "bob.zhang@internal.corp"

sync_tasks:
  - name: test-sync
    repos:
      - id: test-repo
        github_url: $GITHUB_REPO
        internal_url: $INTERNAL_REPO
        branches: ["main"]
        tags: false
        auth:
          type: ssh
EOF

echo "Config file created: $CONFIG_FILE"
cat "$CONFIG_FILE"

echo ""
echo "=== Running git-sync sync ==="
cd "$TEST_DIR"
GIT_SYNC_EXEC="${GIT_SYNC_EXEC:-./dist/git-sync}"

if [ ! -f "$GIT_SYNC_EXEC" ]; then
    echo "Error: git-sync executable not found at $GIT_SYNC_EXEC"
    echo "Please set GIT_SYNC_EXEC environment variable or build the executable first"
    echo "Build command: pyinstaller build.spec"
    exit 1
fi

"$GIT_SYNC_EXEC" sync -c "$CONFIG_FILE" -r test-repo

echo ""
echo "=== Checking internal repo commits ==="
cd "$INTERNAL_REPO"
git log --format="%h - %an <%ae> - %s" --all

echo ""
echo "=== Verifying author rewriting ==="
ALICE_COUNT=$(git log --format="%ae" --all | grep -c "alice.wang@internal.corp" || true)
BOB_COUNT=$(git log --format="%ae" --all | grep -c "bob.zhang@internal.corp" || true)
ORIGINAL_ALICE=$(git log --format="%ae" --all | grep -c "alice@personal.com" || true)
ORIGINAL_BOB=$(git log --format="%ae" --all | grep -c "bob@gmail.com" || true)

ALICE_COUNT=${ALICE_COUNT:-0}
BOB_COUNT=${BOB_COUNT:-0}
ORIGINAL_ALICE=${ORIGINAL_ALICE:-0}
ORIGINAL_BOB=${ORIGINAL_BOB:-0}

echo "Alice (internal): $ALICE_COUNT commits"
echo "Bob (internal): $BOB_COUNT commits"
echo "Alice (original): $ORIGINAL_ALICE commits"
echo "Bob (original): $ORIGINAL_BOB commits"

if [ "$ALICE_COUNT" -ge 2 ] && [ "$BOB_COUNT" -ge 1 ] && [ "$ORIGINAL_ALICE" -eq 0 ] && [ "$ORIGINAL_BOB" -eq 0 ]; then
    echo ""
    echo "=== ✅ TEST PASSED ==="
    echo "All authors were successfully rewritten!"
    exit 0
else
    echo ""
    echo "=== ❌ TEST FAILED ==="
    echo "Author rewriting did not work as expected"
    exit 1
fi