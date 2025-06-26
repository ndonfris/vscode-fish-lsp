#!/usr/bin/env fish

# Global variables for cleanup tracking
set -g e2e_test_pid 
set -g e2e_vscode_pid 0
set -g e2e_log_tail_pid 0
set -g e2e_fish_lsp_pids

function log_step -a message
    echo (set_color green)"[E2E:$e2e_test_pid]"(set_color normal) $message
end

function log_error -a message
    echo (set_color red)"[ERROR:$e2e_test_pid]"(set_color normal) $message >&2
end

function cleanup_test_env
    log_step "Cleaning up test environment..."
    
    # Kill log tail process if running
    if test $e2e_log_tail_pid -gt 0
        kill $e2e_log_tail_pid 2>/dev/null || true
        set e2e_log_tail_pid 0
    end
    
    # Kill VSCode process if we started it
    if test $e2e_vscode_pid -gt 0
        log_step "Terminating VSCode instance (PID: $e2e_vscode_pid)..."
        kill $e2e_vscode_pid 2>/dev/null || true
        set e2e_vscode_pid 0
    end
    
    # Kill specific fish-lsp processes (more targeted than pkill -f)
    for pid in $e2e_fish_lsp_pids
        if test -n "$pid"
            log_step "Terminating fish-lsp process (PID: $pid)..."
            kill $pid 2>/dev/null || true
        end
    end
    set e2e_fish_lsp_pids
    
    # Clean up log file
    rm -f /tmp/fish-lsp-test-$e2e_test_pid.log 2>/dev/null || true
    
    log_step "Cleanup completed"
end

function setup_test_env
    log_step "Setting up test environment..."
    
    # Create test workspace
    fish setup-test-workspace.fish
    
    # Clean previous logs
    rm -f /tmp/fish-lsp-test-$e2e_test_pid.log
    
    # Compile extension
    log_step "Compiling extension..."
    yarn compile
    
    if test $status -ne 0
        log_error "Compilation failed"
        return 1
    end
end

function get_fish_lsp_pids
    # Get fish-lsp processes that aren't part of tmux or other shell sessions
    set -g e2e_fish_lsp_pids (pgrep -f "fish-lsp.*start" 2>/dev/null | tr '\n' ' ')
end

function wait_for_interrupt
    log_step "E2E test running. VSCode PID: $e2e_vscode_pid"
    log_step "Press Ctrl+C to cleanup and exit, or close this terminal."
    
    # Set up signal handling for clean shutdown
    trap cleanup_test_env INT TERM
    
    # Wait for signals or VSCode to exit
    while true
        # Check if VSCode is still running
        if test $e2e_vscode_pid -gt 0
            if not kill -0 $e2e_vscode_pid 2>/dev/null
                log_step "VSCode instance has exited"
                break
            end
        end
        
        sleep 2
    end
end

function run_extension_test
    log_step "Starting VSCode extension test..."
    
    # Set test environment variables with unique log file
    set -gx FISH_LSP_TEST_MODE true
    set -gx FISH_LSP_LOG_FILE /tmp/fish-lsp-test-$e2e_test_pid.log
    set -gx fish_lsp_log_level debug
    
    # Create workspace name with PID
    set workspace_name "fish-lsp-test-$e2e_test_pid"
    
    # Start the extension in debug mode with custom workspace name
    log_step "Launching VSCode with workspace name: $workspace_name"
    code \
        --extensionDevelopmentPath=(pwd) \
        --disable-extensions \
        --user-data-dir=(pwd)/.vscode-test-data-$e2e_test_pid \
        --name="$workspace_name" \
        ./test-workspace &
    
    set e2e_vscode_pid $last_pid
    log_step "VSCode started with PID: $e2e_vscode_pid"
    
    # Wait a bit for VSCode to start
    sleep 5
    
    # Get fish-lsp PIDs after VSCode starts
    get_fish_lsp_pids
    
    # Check if fish-lsp process is running
    if test -n "$e2e_fish_lsp_pids"
        log_step "✅ fish-lsp server is running (PIDs: $e2e_fish_lsp_pids)"
    else
        log_error "❌ fish-lsp server not detected"
        return 1
    end
    
    # Monitor logs if they exist
    if test -f /tmp/fish-lsp-test-$e2e_test_pid.log
        log_step "📝 Starting log monitor..."
        tail -f /tmp/fish-lsp-test-$e2e_test_pid.log &
        set e2e_log_tail_pid $last_pid
        log_step "Log monitor PID: $e2e_log_tail_pid"
    end
    
    # Wait for user interrupt or VSCode exit
    wait_for_interrupt
end

function handle_exit --on-signal INT --on-signal TERM
    log_step "Received exit signal, cleaning up..."
    cleanup_test_env
    exit 0
end

function main
    log_step "🧪 Starting Fish LSP E2E Tests (PID: $e2e_test_pid)"
    
    # Check if we're in tmux and warn user
    if set -q TMUX
        log_step "🪟 Running inside tmux session - cleanup will be tmux-safe"
    end
    
    if not setup_test_env
        log_error "Failed to setup test environment"
        cleanup_test_env
        return 1
    end
    
    if not run_extension_test
        log_error "Extension test failed"
        cleanup_test_env
        return 1
    end
    
    cleanup_test_env
end

# Ensure cleanup happens on script exit
trap cleanup_test_env EXIT

# Run main function
main $argv
