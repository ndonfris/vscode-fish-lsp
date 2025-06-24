#!/usr/bin/env fish

# Create test workspace structure
set test_workspace_dir ./test-workspace
mkdir -p $test_workspace_dir/{functions,completions,conf.d}

# Create sample fish files for testing
echo 'function hello_world -d "Test function"
    echo "Hello from test workspace!"
    echo "Args: $argv"
end' > $test_workspace_dir/functions/hello_world.fish

echo 'function test_completion -d "Test completion"
    echo "Testing completion features"
end' > $test_workspace_dir/functions/test_completion.fish

echo '# Test configuration
set -gx TEST_VAR "test_value"
set -gx fish_lsp_log_file "/tmp/fish-lsp"
set -gx fish_lsp_log_level "debug"' > $test_workspace_dir/config.fish

echo 'complete -c test_completion -s h -l help -d "Show help"
complete -c test_completion -s v -l verbose -d "Verbose output"' > $test_workspace_dir/completions/test_completion.fish

echo '# Test conf.d file
if status is-interactive
    echo "Test workspace loaded"
end' > $test_workspace_dir/conf.d/test.fish

# Create VSCode workspace settings
echo '{
  "folders": [
    {
      "path": "$HOME/repos/.dotfiles-main"
    }
  ],
  "settings": {
    "fish-lsp.trace.server": "verbose",
    "fish-lsp.enableWorkspaceFolders": true
  }
}' > $test_workspace_dir/test-workspace.code-workspace

echo "Test workspace created at: $test_workspace_dir"
